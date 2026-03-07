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

app.use(express.json());
app.use(express.static(path.join(__dirname, build_name)));

/**
 * Summarize the given entries
 * @param entries {Array<string>} Each item in the list is the content of an entry
 * @returns An AI generated summary of the given entries
 */
async function GenerateSummary(entries) {
  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `You are to summarize a user's journal entries for a month. Do not make assumptions, don't be sappy. Be more direct. Use second person only, less formal. Max of 5 sentences. There's ${entries.length} entries. START: ${entries.join("\nNext:\n")}\nThen, type "**Highlights:**" and separately from the summary give 3 events that are highlights from the month, still in second person, numbered.`,
  });

  return response.candidates[0].content.parts[0].text;
}

app.post('/api/generate-summary', (req, res) => {
  const { entries } = req.body;

  if (!entries.length) {
    return res.status(400).json({ error: "Missing the 'entries' body param", summary: null });
  }

  GenerateSummary(entries)
    .then((response) => res.status(200).json({ summary: response, error: null }));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, build_name, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
