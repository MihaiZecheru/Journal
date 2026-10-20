// This is the file that runs in the ubuntu droplet on digital ocean to serve my react app

import express from 'express';
import path from 'path';
import cors from 'cors';
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 4002;
const build_name = '../build';

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SUMMARY_MODEL = process.env.GEMINI_SUMMARY_MODEL || 'gemini-3.5-flash';
const SEARCH_MODEL = 'gemini-3.5-flash';

// ─── Security: CORS ───────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://journal.mzecheru.com'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Limit request body payload size to 256KB to block multi-megabyte flood attacks
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, build_name)));

// ─── Security: In-Memory Rate Limiter ──────────────────────────────────────────
function createRateLimiter({ windowMs, max, message }) {
  const ipHits = new Map();

  // Periodically purge stale IP entries
  const cleanupInterval = Math.min(windowMs, 60_000);
  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of ipHits.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        ipHits.delete(ip);
      } else {
        ipHits.set(ip, valid);
      }
    }
  }, cleanupInterval).unref();

  return (req, res, next) => {
    // Respect Cloudflare proxy header or x-forwarded-for before socket address
    const ip = (
      req.headers['cf-connecting-ip'] ||
      (req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : '') ||
      req.socket.remoteAddress ||
      'unknown'
    );

    const now = Date.now();
    const timestamps = (ipHits.get(ip) || []).filter(t => now - t < windowMs);

    if (timestamps.length >= max) {
      return res.status(429).json({
        error: message || 'Too many requests. Please slow down and try again later.',
      });
    }

    timestamps.push(now);
    ipHits.set(ip, timestamps);
    next();
  };
}

// Limit /api/* endpoints to 30 requests per 15 minutes per IP
const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Rate limit exceeded for API endpoints. Please wait before making more requests.',
});

app.use('/api/', apiLimiter);

// ─── Security: Supabase Authentication Middleware ─────────────────────────────
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization header' });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Empty token' });
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('Server configuration error: SUPABASE_URL or SUPABASE_ANON_KEY missing in environment');
      return res.status(500).json({ error: 'Server authentication configuration error' });
    }

    // Verify token directly with Supabase Auth
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!userRes.ok) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    }

    const userData = await userRes.json();
    if (!userData || !userData.id) {
      return res.status(401).json({ error: 'Unauthorized: User not recognized' });
    }

    req.user = userData;
    next();
  } catch (err) {
    console.error('Auth verification error:', err.message);
    return res.status(401).json({ error: 'Authentication verification failed' });
  }
}

// ─── AI Logic ─────────────────────────────────────────────────────────────────

/**
 * Summarize the given entries
 * @param entries {Array<string>} Each item in the list is the content of an entry
 * @returns An AI generated summary of the given entries
 */
async function GenerateSummary(entries) {
  const prompt = `You are to summarize a user's journal entries for a month. Do not make assumptions, don't be sappy. Be more direct. Use second person only, less formal. Max of 5 sentences. 
There's ${entries.length} entries. START: ${entries.join("\nNext:\n")}\nThen, type "**Highlights:**" and separately from the summary give 3 events that are highlights from the month, still in second person, numbered.`;

  const response = await gemini.models.generateContent({
    model: SUMMARY_MODEL,
    contents: [{
      role: "user",
      parts: [{
        text: prompt,
      }],
    }],
  });

  return response.candidates[0].content.parts[0].text;
}

async function SearchWithAI(query, entries) {
  const formattedEntries = entries
    .map(e => `Date: ${e.date}\nEntry: ${e.entry}`)
    .join('\n\n');

  const today = new Date().toISOString().split('T')[0];

  const prompt = `Today's date is ${today}. Answer the following query using the journal entries provided. If you can't find the answer, let the user know. 
Cite the dates of the entries you used to come up with your answer, and provide a brief quote from each that aided your answer. You are an AI agent that answers questions that the user has about their Journal entries.

Query: ${query}

START ENTRIES:
${formattedEntries}
END ENTRIES.`;

  const response = await gemini.models.generateContent({
    model: SEARCH_MODEL,
    contents: [{
      role: "user",
      parts: [{
        text: prompt,
      }],
    }],
  });

  return response.candidates[0].content.parts[0].text;
}

/**
 * Expand a search question into a list of keywords a person might realistically
 * write in a personal journal when describing that topic.
 * @param {string} question
 * @returns {Promise<string[]>}
 */
async function GenerateSearchKeywords(question) {
  const response = await gemini.models.generateContent({
    model: SEARCH_MODEL,
    contents: [{
      role: "user",
      parts: [{
        text: `You are helping search a personal journal. Given a question, return a JSON array of up to 15 words that someone might realistically write in a personal diary when describing the topic of this question. You do not need to generate all 15 if fewer keywords are sufficient to cover the topic.
Think broadly: include synonyms, brand names, casual language, abbreviations, and related concepts. Avoid extremely broad or common words like "him", "the", "and", "went", "got", "was", "my", etc. that would match almost any entry. Do not include year numbers, dates, days, or time periods (e.g. "2024", "2025", "january", "summer", "week") as keywords since date filtering is handled separately. If the question is a broad summary or recap of a time period with no specific topic (e.g. "what did I do in 2025", "summarize last week"), return an empty array []. This is going to be used for a keyword-based search. Return ONLY a valid JSON array of lowercase strings, no markdown, no explanation.

Question: ${question}`,
      }],
    }],
  });

  const raw = response.candidates[0].content.parts[0].text.trim();
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned);
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

app.post('/api/generate-summary', requireAuth, async (req, res) => {
  try {
    const { entries } = req.body || {};

    if (!entries || !Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ error: "Missing or invalid 'entries' body param", summary: null });
    }

    // Guard: Max 40 entries for a single month's summary
    if (entries.length > 40) {
      return res.status(400).json({ error: "Too many entries. Maximum 40 entries allowed.", summary: null });
    }

    // Guard: Truncate individual entries to 8,000 chars to avoid token bombs
    const sanitizedEntries = entries
      .filter(e => typeof e === 'string' && e.trim().length > 0)
      .map(e => e.slice(0, 8000));

    if (!sanitizedEntries.length) {
      return res.status(400).json({ error: "No valid entries provided", summary: null });
    }

    const summary = await GenerateSummary(sanitizedEntries);
    return res.status(200).json({ summary, error: null });
  } catch (err) {
    console.error('Error in /api/generate-summary:', err.message);
    return res.status(500).json({ error: 'Failed to generate summary', summary: null });
  }
});

app.post('/api/ai-search', requireAuth, async (req, res) => {
  try {
    const { question, entries } = req.body || {};

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: "Missing or invalid 'question' body param", answer: null });
    }

    if (!entries || !Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ error: "Missing or invalid 'entries' body param", answer: null });
    }

    if (question.length > 500) {
      return res.status(400).json({ error: "Question too long. Maximum 500 characters allowed.", answer: null });
    }

    // Guard: Cap entries to 100 items, and 3,000 characters per entry
    const sanitizedEntries = entries.slice(0, 100).map(e => ({
      date: String(e.date || '').slice(0, 20),
      entry: String(e.entry || '').slice(0, 3000),
    }));

    const answer = await SearchWithAI(question.trim().slice(0, 500), sanitizedEntries);
    return res.status(200).json({ answer, error: null });
  } catch (err) {
    console.error('Error in /api/ai-search:', err.message);
    return res.status(500).json({ error: 'Failed to perform AI search', answer: null });
  }
});

app.post('/api/generate-search-keywords', requireAuth, async (req, res) => {
  try {
    const { question } = req.body || {};

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: "Missing or invalid 'question' body param", keywords: null });
    }

    if (question.length > 300) {
      return res.status(400).json({ error: "Question too long. Maximum 300 characters allowed.", keywords: null });
    }

    const keywords = await GenerateSearchKeywords(question.trim().slice(0, 300));
    return res.status(200).json({ keywords, error: null });
  } catch (err) {
    console.error('Error in /api/generate-search-keywords:', err.message);
    return res.status(500).json({ error: 'Failed to generate keywords', keywords: null });
  }
});

app.post('/api/create-short-url', requireAuth, async (req, res) => {
  try {
    const { url, alias, permanent } = req.body || {};
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: "Missing or invalid 'url' parameter", short_url: null });
    }

    if (url.length > 2048) {
      return res.status(400).json({ error: "URL too long. Maximum 2048 characters.", short_url: null });
    }

    const bebUrl = (process.env.BEB_URL || 'https://beb.mzecheru.com').replace(/\/+$/, '');
    const creatorId = process.env.BEB_USER_ID || '2f02d928-5f92-46cf-a2e8-49a3aa8a7bc1';

    const bebRes = await fetch(`${bebUrl}/api/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        creator: creatorId,
        url,
        alias: alias ? String(alias).slice(0, 50) : undefined,
        permanent: permanent !== undefined ? Boolean(permanent) : true,
      }),
    });

    const data = await bebRes.json();
    return res.status(bebRes.status).json({
      error: data.error || null,
      short_url: data.short_url,
      full_short_url: data.short_url ? `${bebUrl}/${data.short_url}` : null,
    });
  } catch (err) {
    console.error('Error proxying short URL creation to Beb:', err.message);
    return res.status(500).json({ error: 'Failed to create short URL', short_url: null });
  }
});

app.post('/share-target', (req, res) => {
  res.redirect(303, '/home?shared_photos=1');
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, build_name, 'index.html'));
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// Catch all errors so no stack traces or server paths leak to clients
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'An unexpected server error occurred' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
