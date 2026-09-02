// This is the file that runs in the ubuntu droplet on digital ocean to serve my react app

import express from 'express';
import path from 'path';
import cors from 'cors';
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from 'url'; // Needed to replace __dirname
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url); // Needed for ejs shit
const __dirname = path.dirname(__filename); // Needed for ejs shit

const app = express();
const port = process.env.PORT || 4002;
const build_name = '../build';

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://journal.mzecheru.com'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, build_name)));

/**
 * Summarize the given entries
 * @param entries {Array<string>} Each item in the list is the content of an entry
 * @returns An AI generated summary of the given entries
 */
async function GenerateSummary(entries) {
	const prompt = `You are to summarize a user's journal entries for a month. Do not make assumptions, don't be sappy. Be more direct. Use second person only, less formal. Max of 5 sentences. 
There's ${entries.length} entries. START: ${entries.join("\nNext:\n")}\nThen, type "**Highlights:**" and separately from the summary give 3 events that are highlights from the month, still in second person, numbered.`;

  const response = await gemini.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [{
			role: "user",
			parts: [{
				text: prompt,
			}]
		}]
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
    model: "gemini-3.5-flash",
    contents: [{
      role: "user",
      parts: [{
        text: prompt
      }]
    }]
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
    model: "gemini-3.5-flash",
    contents: [{
      role: "user",
      parts: [{
        text: `You are helping search a personal journal. Given a question, return a JSON array of up to 15 words that someone might realistically write in a personal diary when describing the topic of this question. You do not need to generate all 15 if fewer keywords are sufficient to cover the topic.
Think broadly: include synonyms, brand names, casual language, abbreviations, and related concepts. Avoid extremely broad or common words like "him", "the", "and", "went", "got", "was", "my", etc. that would match almost any entry. Do not include year numbers, dates, days, or time periods (e.g. "2024", "2025", "january", "summer", "week") as keywords since date filtering is handled separately. If the question is a broad summary or recap of a time period with no specific topic (e.g. "what did I do in 2025", "summarize last week"), return an empty array []. This is going to be used for a keyword-based search. Return ONLY a valid JSON array of lowercase strings, no markdown, no explanation.

Question: ${question}`
      }]
    }]
  });

  const raw = response.candidates[0].content.parts[0].text.trim();
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned);
}

app.post('/api/generate-summary', (req, res) => {
  const { entries } = req.body || {};

  if (!entries || !Array.isArray(entries) || !entries.length) {
    return res.status(400).json({ error: "Missing or invalid 'entries' body param", summary: null });
  }

  GenerateSummary(entries)
    .then((response) => res.status(200).json({ summary: response, error: null }))
    .catch((err) => res.status(500).json({ error: err.message, summary: null }));
});

app.post('/api/ai-search', (req, res) => {
  const { question, entries } = req.body;

  if (!entries.length) {
    return res.status(400).json({ error: "Missing the 'entries' body param", answer: null });
  }

  SearchWithAI(question, entries)
    .then((response) => res.status(200).json({ answer: response, error: null }))
    .catch((err) => res.status(500).json({ error: err.message, answer: null }));
});

app.post('/api/generate-search-keywords', (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: "Missing the 'question' body param", keywords: null });
  }

  GenerateSearchKeywords(question)
    .then((keywords) => res.status(200).json({ keywords, error: null }))
    .catch((err) => res.status(500).json({ error: err.message, keywords: null }));
});

app.post('/api/create-short-url', async (req, res) => {
  try {
    const { url, alias, permanent } = req.body || {};
    if (!url) {
      return res.status(400).json({ error: "Missing 'url' parameter", short_url: null });
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
        alias,
        permanent: permanent !== undefined ? permanent : true,
      }),
    });

    const data = await bebRes.json();
    return res.status(bebRes.status).json({
      error: data.error || null,
      short_url: data.short_url,
      full_short_url: data.short_url ? `${bebUrl}/${data.short_url}` : null,
    });
  } catch (err) {
    console.error('Error proxying short URL creation to Beb:', err);
    return res.status(500).json({ error: err.message, short_url: null });
  }
});

app.post('/share-target', (req, res) => {
  res.redirect(303, '/home?shared_photos=1');
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, build_name, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
