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
const port = 3002;
const build_name = 'build';

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
    model: "gemini-2.5-flash",
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

Query: ${query}

START ENTRIES:
${formattedEntries}
END ENTRIES.`;

  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
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
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [{
        text: `You are helping search a personal journal. Given a question, return a JSON array of up to 15 words that someone might realistically write in a personal diary when describing the topic of this question. You do not need to generate all 15 if fewer keywords are sufficient to cover the topic.
Think broadly: include synonyms, brand names, casual language, abbreviations, and related concepts. Avoid extremely broad or common words like "him", "the", "and", "went", "got", "was", "my", etc. that would match almost any entry. This is going to be used for a keyword-based search. Return ONLY a valid JSON array of lowercase strings, no markdown, no explanation.

Question: ${question}`
      }]
    }]
  });

  const raw = response.candidates[0].content.parts[0].text.trim();
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned);
}

app.post('/api/generate-summary', (req, res) => {
  const { entries } = req.body;

  if (!entries.length) {
    return res.status(400).json({ error: "Missing the 'entries' body param", summary: null });
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, build_name, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
