import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_DIR = '/home/Journal/db-backups';
const KEEP_DAYS = 14;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// ─── Supabase fetch ───────────────────────────────────────────────────────────

async function fetchTable(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Range-Unit': 'items',
      'Range': '0-99999',
    },
  });

  if (!res.ok) throw new Error(`Failed to fetch ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function toCSV(rows) {
  if (!rows.length) return '';

  const headers = Object.keys(rows[0]);

  // Always quote every field — handles commas, quotes, and newlines safely
  const escape = (val) => {
    if (val === null || val === undefined) return '""';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const lines = [
    headers.map(escape).join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(',')),
  ];

  return lines.join('\n');
}

// ─── Rotation ─────────────────────────────────────────────────────────────────

function rotatOldBackups() {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });

  let deleted = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
    const dirDate = new Date(entry.name).getTime();
    if (dirDate < cutoff) {
      fs.rmSync(path.join(BACKUP_DIR, entry.name), { recursive: true });
      deleted++;
    }
  }

  return deleted;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const today = new Date().toISOString().split('T')[0];
  const outDir = path.join(BACKUP_DIR, today);

  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[${new Date().toLocaleString()}] Starting backup → ${outDir}`);

  const [entries, summaries] = await Promise.all([
    fetchTable('Entries'),
    fetchTable('Summaries'),
  ]);

  fs.writeFileSync(path.join(outDir, 'entries.csv'), toCSV(entries));
  fs.writeFileSync(path.join(outDir, 'summaries.csv'), toCSV(summaries));

  console.log(`[${new Date().toLocaleString()}] Saved ${entries.length} entries, ${summaries.length} summaries`);

  const deleted = rotatOldBackups();
  const remaining = fs.readdirSync(BACKUP_DIR).filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n)).length;
  console.log(`[${new Date().toLocaleString()}] Rotation done — removed ${deleted} old backup(s), ${remaining} remaining`);
})();
