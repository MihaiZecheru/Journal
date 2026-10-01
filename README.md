# 📖 Journal

> **Remember every day.** A simple journaling web app to log daily thoughts, revisit past memories, and generate AI-powered monthly summaries.

I used AI for the Memories feature. Everything else was made without AI.

---

## Features

- **Daily Entries** — Log and manage entries with a clean, easy-to-use interface.
- **AI Summaries** — Generate monthly and yearly summaries with AI.
- **Memories** — Upload memories worth looking back on.
- **Shareable Entries** — Securely share chosen entries via private links.
- **Authentication & Sync** — Secure user accounts and cloud storage through Supabase.

---

## Tech Stack

- React, TypeScript, FullCalendar, MDB UI Kit
- Node.js, Express, Supabase, Gemini API

---

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/your-username/journal.git
cd journal
npm install
```

### 2. Environment Variables

Create a `.env` file based on `.env.example`:

```env
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
PORT=3000
```

### 3. Build & Run

```bash
npm run build
npm start
```

---

## License

Distributed under the MIT License.

