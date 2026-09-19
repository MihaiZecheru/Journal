#!/usr/bin/env node
/**
 * Bulk Upload Memories CLI Tool for Journal
 *
 * Efficiently uploads large media libraries (10GB - 50GB+) directly from the local
 * filesystem to PiStorage with:
 *  - Zero RAM bloat: Streams directly via fs.openAsBlob without buffering in memory
 *  - Fast EXIF date extraction (reads only the initial header bytes)
 *  - Filename & mtime date fallbacks (America/Los_Angeles timezone matching web app)
 *  - Pre-flight SHA-256 deduplication via PiStorage /api/check-hashes API
 *  - Automatic chunking (5 files per batch) & rate-limit backoff (HTTP 429 retry)
 *  - Resumable state manifest so interrupted uploads can resume without re-uploading
 *  - Real-time terminal progress indicators & summary reports
 *
 * Usage:
 *   node scripts/bulk-upload-memories.mjs --dir "D:/Photos/2024" --user-id "<your-uuid>"
 *   node scripts/bulk-upload-memories.mjs --dir "D:/Photos" --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import ExifReader from 'exifreader';

// ─── Environment & Config Loader ─────────────────────────────────────────────

function loadEnv() {
  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'server', '.env'),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const CONFIG = {
  PISTORAGE_URL: (
    process.env.PISTORAGE_URL ||
    process.env.REACT_APP_PISTORAGE_URL ||
    'https://storage.mzecheru.com'
  ).replace(/\/+$/, ''),
  PISTORAGE_API_KEY:
    process.env.PISTORAGE_API_KEY ||
    process.env.REACT_APP_PISTORAGE_API_KEY ||
    '',
  DEFAULT_FOLDER:
    process.env.PISTORAGE_DEFAULT_FOLDER ||
    process.env.REACT_APP_PISTORAGE_DEFAULT_FOLDER ||
    '/journal',
  MAX_CHUNK_FILES: 5,
  MAX_FILE_SIZE_BYTES: 1.5 * 1024 * 1024 * 1024, // 1.5 GB
  HASH_CHECK_BATCH_SIZE: 300,
};

const SUPPORTED_EXTENSIONS = new Set([
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.tiff', '.tif', '.bmp', '.avif',
  // Videos
  '.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.3gp',
]);

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.3gp',
]);

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDuration(ms) {
  const sec = Math.floor((ms / 1000) % 60);
  const min = Math.floor((ms / (1000 * 60)) % 60);
  const hr = Math.floor(ms / (1000 * 60 * 60));
  if (hr > 0) return `${hr}h ${min}m ${sec}s`;
  if (min > 0) return `${min}m ${sec}s`;
  return `${sec}s`;
}

function toLosAngelesDateString(date) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    const pstDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const year = pstDate.getFullYear();
    const month = String(pstDate.getMonth() + 1).padStart(2, '0');
    const day = String(pstDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

function parseDateFromFilename(fileName) {
  if (!fileName) return null;

  // YYYY-MM-DD or YYYY_MM_DD
  const isoMatch = fileName.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (isoMatch) {
    const [, yr, mo, da] = isoMatch;
    const m = parseInt(mo, 10);
    const d = parseInt(da, 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${yr}-${mo}-${da}`;
  }

  // YYYYMMDD (e.g. IMG_20260823_142000, 20260823)
  const compactMatch = fileName.match(/(?:IMG_|PXL_|VID_)?(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    const [, yr, mo, da] = compactMatch;
    const yNum = parseInt(yr, 10);
    const m = parseInt(mo, 10);
    const d = parseInt(da, 10);
    if (yNum >= 1990 && yNum <= 2050 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${yr}-${mo}-${da}`;
    }
  }

  // Month-DD-YYYY or Month DD YYYY (e.g. Aug-23-2026)
  const mmmMatch = fileName.match(/([a-zA-Z]{3,9})[-_\s](\d{1,2})[-_\s](\d{4})/);
  if (mmmMatch) {
    const [, monthStr, dayStr, yearStr] = mmmMatch;
    const mLower = monthStr.toLowerCase();
    const mIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(mLower.substring(0, 3)));
    if (mIdx !== -1) {
      const monthFormatted = String(mIdx + 1).padStart(2, '0');
      const dayFormatted = String(parseInt(dayStr, 10)).padStart(2, '0');
      return `${yearStr}-${monthFormatted}-${dayFormatted}`;
    }
  }

  return null;
}

// ─── Fast EXIF Header Date Parsing ───────────────────────────────────────────

async function extractFileDate(filePath, stats) {
  const ext = path.extname(filePath).toLowerCase();

  // Try EXIF for image files by reading only the first 128 KB (header) for speed
  if (!VIDEO_EXTENSIONS.has(ext)) {
    try {
      const fd = fs.openSync(filePath, 'r');
      const headerBufferSize = Math.min(stats.size, 131072); // 128KB
      const buffer = Buffer.alloc(headerBufferSize);
      fs.readSync(fd, buffer, 0, headerBufferSize, 0);
      fs.closeSync(fd);

      const tags = ExifReader.load(buffer, { expanded: true });
      const exif = tags.exif || {};

      const dateTag = exif.DateTimeOriginal || exif.CreateDate || exif.DateTimeDigitized || exif.DateTime;
      if (dateTag && dateTag.description) {
        const raw = String(dateTag.description).trim();
        const match = raw.match(/^(\d{4})[:\-/](\d{2})[:\-/](\d{2})/);
        if (match) {
          const [, yr, mo, da] = match;
          return `${yr}-${mo}-${da}`;
        }
      }
    } catch {
      // Non-fatal, fallback to filename/mtime
    }
  }

  // Heuristic 2: Filename pattern
  const filename = path.basename(filePath);
  const fromName = parseDateFromFilename(filename);
  if (fromName) return fromName;

  // Heuristic 3: File birthtime or mtime in America/Los_Angeles
  const fileDate = stats.birthtime && stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime;
  return toLosAngelesDateString(fileDate);
}

// ─── Streamed SHA-256 Calculation (0 MB RAM Bloat) ───────────────────────────

function computeFileHashStream(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 128 * 1024 });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
    stream.on('error', (err) => reject(err));
  });
}

// ─── Recursive File Scanner ──────────────────────────────────────────────────

async function scanDirectory(dirPath) {
  const fileList = [];
  let totalBytes = 0;

  async function walk(currentDir) {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '$RECYCLE.BIN') {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          const stats = await fs.promises.stat(fullPath);
          fileList.push({
            filePath: fullPath,
            fileName: entry.name,
            size: stats.size,
            stats,
            isVideo: VIDEO_EXTENSIONS.has(ext),
          });
          totalBytes += stats.size;
        }
      }
    }
  }

  await walk(dirPath);
  return { files: fileList, totalBytes };
}

// ─── PiStorage API Client ────────────────────────────────────────────────────

class BulkUploader {
  constructor(apiKey, baseUrl, defaultFolder) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.defaultFolder = defaultFolder;
  }

  get headers() {
    const h = {};
    if (this.apiKey) {
      h['X-API-Key'] = this.apiKey;
    }
    return h;
  }

  async checkHashes(hashes) {
    if (!hashes.length) return {};
    const res = await fetch(`${this.baseUrl}/api/check-hashes`, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hashes }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Check hashes failed HTTP ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.duplicates || {};
  }

  async uploadChunk(targetFolder, items) {
    const formData = new FormData();
    formData.append('server_path', targetFolder);

    for (const item of items) {
      // fs.openAsBlob streams the file directly from disk without reading it all into memory!
      const blob = await fs.openAsBlob(item.filePath);
      formData.append('images', blob, item.fileName);
    }

    let attempts = 0;
    const maxRetries = 4;

    while (attempts < maxRetries) {
      attempts++;
      try {
        const res = await fetch(`${this.baseUrl}/upload`, {
          method: 'POST',
          headers: this.headers,
          body: formData,
        });

        // Handle rate limits
        if (res.status === 429) {
          const retryHeader = res.headers.get('Retry-After');
          const waitSec = retryHeader ? Math.max(parseInt(retryHeader, 10), 1) : Math.pow(2, attempts) * 2;
          console.log(`\n⏳ [Rate Limit] HTTP 429 hit. Pausing for ${waitSec}s (retry ${attempts}/${maxRetries})...`);
          await sleep(waitSec * 1000);
          continue;
        }

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Server returned HTTP ${res.status}: ${errText}`);
        }

        const data = await res.json();
        return data;
      } catch (err) {
        if (attempts >= maxRetries) {
          throw err;
        }
        const backoff = 1500 * attempts;
        console.warn(`\n⚠️ Network error: ${err.message}. Retrying in ${backoff / 1000}s...`);
        await sleep(backoff);
      }
    }
  }
}

// ─── CLI Argument Parser ─────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dir: '',
    userId: process.env.BEB_USER_ID || process.env.JOURNAL_USER_ID || '',
    dryRun: false,
    forceDate: '',
    resume: true,
    cleanState: false,
    batchSize: CONFIG.MAX_CHUNK_FILES,
    apiKey: CONFIG.PISTORAGE_API_KEY,
    url: CONFIG.PISTORAGE_URL,
    defaultFolder: CONFIG.DEFAULT_FOLDER,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dir' || arg === '-d') {
      options.dir = args[++i];
    } else if (arg === '--user-id' || arg === '-u') {
      options.userId = args[++i];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force-date') {
      options.forceDate = args[++i];
    } else if (arg === '--no-resume') {
      options.resume = false;
    } else if (arg === '--clean-state') {
      options.cleanState = true;
    } else if (arg === '--batch-size' || arg === '-b') {
      options.batchSize = parseInt(args[++i], 10) || CONFIG.MAX_CHUNK_FILES;
    } else if (arg === '--api-key' || arg === '-k') {
      options.apiKey = args[++i];
    } else if (arg === '--url') {
      options.url = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
===================================================================
 📖 Journal Memories Bulk Uploader CLI (10GB - 50GB+ Optimized)
===================================================================

Upload large folders of photos and videos with EXIF date grouping,
streamed SHA-256 deduplication, automatic rate-limit backoff, and resume.

Usage:
  node scripts/bulk-upload-memories.mjs --dir <folder-path> [options]

Required Options:
  -d, --dir <path>          Local folder containing photos/videos (scanned recursively)

Options:
  -u, --user-id <uuid>      Journal User UUID (defaults to BEB_USER_ID from .env)
  --dry-run                 Simulate scan, EXIF extraction & duplicate check without uploading
  --force-date <YYYY-MM-DD> Force all uploaded media into a specific date folder
  --batch-size <num>        Upload chunk size (default: 5 files per multipart request)
  --no-resume               Ignore previous upload state and process everything from scratch
  --clean-state             Delete the saved upload state manifest for this directory
  -k, --api-key <key>       Override PiStorage API Key
  --url <baseUrl>           Override PiStorage Base URL (default: https://storage.mzecheru.com)
  -h, --help                Show this help message

Examples:
  # Preview what will be uploaded without sending files:
  node scripts/bulk-upload-memories.mjs --dir "C:/Users/Chris/Pictures/Trip2024" --dry-run

  # Perform full bulk upload for a specific user:
  node scripts/bulk-upload-memories.mjs --dir "D:/Photos/2023" --user-id "fe9f8d37-7849-4721-8ea1-1c192486b942"
`);
}

// ─── State Manifest Management ───────────────────────────────────────────────

function getStateFilePath(targetDir, userId) {
  const hash = crypto.createHash('md5').update(`${path.resolve(targetDir)}_${userId}`).digest('hex').slice(0, 8);
  return path.resolve(process.cwd(), `.bulk-upload-state-${hash}.json`);
}

function loadState(stateFile) {
  if (fs.existsSync(stateFile)) {
    try {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch {
      return { completedHashes: {}, fileHashMap: {} };
    }
  }
  return { completedHashes: {}, fileHashMap: {} };
}

function saveState(stateFile, state) {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('Could not save state manifest:', err.message);
  }
}

// ─── Interactive User ID Prompt ──────────────────────────────────────────────

async function promptForUserId() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('👤 Enter your Journal User UUID (e.g., fe9f8d37-7849-4721-8ea1-1c192486b942): ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── Main Execution ──────────────────────────────────────────────────────────

async function main() {
  console.log(`\n===================================================================`);
  console.log(` 🚀 Journal Memories Bulk Uploader CLI`);
  console.log(`===================================================================\n`);

  const opts = parseArgs();

  if (!opts.dir) {
    console.error('❌ Error: Missing required --dir parameter.\n');
    printHelp();
    process.exit(1);
  }

  const resolvedDir = path.resolve(opts.dir);
  if (!fs.existsSync(resolvedDir)) {
    console.error(`❌ Error: Directory does not exist: ${resolvedDir}`);
    process.exit(1);
  }

  if (!opts.userId) {
    opts.userId = await promptForUserId();
    if (!opts.userId) {
      console.error('❌ Error: User ID is required to route memories to /journal/<userId>/<date>.');
      process.exit(1);
    }
  }

  if (!opts.apiKey) {
    console.error('❌ Error: PiStorage API Key not found. Please set PISTORAGE_API_KEY in .env or pass --api-key.');
    process.exit(1);
  }

  const stateFile = getStateFilePath(resolvedDir, opts.userId);
  if (opts.cleanState && fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
    console.log(`🧹 Cleaned existing state manifest: ${stateFile}\n`);
  }

  const state = opts.resume ? loadState(stateFile) : { completedHashes: {}, fileHashMap: {} };

  console.log(`📂 Source Directory : ${resolvedDir}`);
  console.log(`👤 Target User ID   : ${opts.userId}`);
  console.log(`🌐 Storage Endpoint : ${opts.url}`);
  console.log(`⚡ Upload Batch Size: ${opts.batchSize} files / batch`);
  console.log(`📝 Resume State File: ${path.basename(stateFile)} (${Object.keys(state.completedHashes || {}).length} previously uploaded)`);
  if (opts.dryRun) {
    console.log(`🔍 Mode             : DRY RUN (Simulation only, no files will be uploaded)`);
  }
  console.log(`-------------------------------------------------------------------\n`);

  // Step 1: Scan Directory
  process.stdout.write('🔍 Scanning files recursively... ');
  const scanStart = Date.now();
  const { files, totalBytes } = await scanDirectory(resolvedDir);
  console.log(`Found ${files.length} media files (${formatBytes(totalBytes)}) in ${formatDuration(Date.now() - scanStart)}.`);

  if (files.length === 0) {
    console.log('\n✨ No supported images or videos found to upload.');
    return;
  }

  // Step 2: Extract Dates & Compute SHA-256 Hashes
  console.log(`\n⏳ Extracting EXIF dates and computing SHA-256 hashes...`);
  const preparedItems = [];
  let hashedCount = 0;
  let totalHashedBytes = 0;
  const hashStart = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Check if we cached the hash from a previous run
    let hash = state.fileHashMap?.[file.filePath];
    if (!hash) {
      hash = await computeFileHashStream(file.filePath);
      state.fileHashMap[file.filePath] = hash;
    }

    const date = opts.forceDate || (await extractFileDate(file.filePath, file.stats));
    preparedItems.push({
      ...file,
      hash,
      date,
    });

    hashedCount++;
    totalHashedBytes += file.size;

    if (hashedCount % 50 === 0 || hashedCount === files.length) {
      const pct = ((hashedCount / files.length) * 100).toFixed(1);
      const elapsed = Math.max((Date.now() - hashStart) / 1000, 0.1);
      const mbps = (totalHashedBytes / (1024 * 1024) / elapsed).toFixed(1);
      process.stdout.write(`\r   [${hashedCount}/${files.length}] (${pct}%) - Speed: ${mbps} MB/s | Current: ${file.fileName.slice(0, 30)}...   `);
    }
  }
  console.log(`\n✅ Finished hashing in ${formatDuration(Date.now() - hashStart)}.`);
  saveState(stateFile, state);

  // Step 3: Deduplication via PiStorage /api/check-hashes
  console.log(`\n🔎 Checking for existing files on PiStorage server (deduplication)...`);
  const uploader = new BulkUploader(opts.apiKey, opts.url, opts.defaultFolder);
  const uniqueHashes = Array.from(new Set(preparedItems.map((item) => item.hash)));

  const serverDuplicateMap = {};
  for (let i = 0; i < uniqueHashes.length; i += CONFIG.HASH_CHECK_BATCH_SIZE) {
    const batch = uniqueHashes.slice(i, i + CONFIG.HASH_CHECK_BATCH_SIZE);
    try {
      const dups = await uploader.checkHashes(batch);
      Object.assign(serverDuplicateMap, dups);
    } catch (err) {
      console.warn(`   ⚠️ Warning: Hash check batch failed: ${err.message}. Will proceed without pre-flight skip.`);
    }
  }

  // Filter items into To-Upload vs. Skipped
  const userPrefix = `${CONFIG.DEFAULT_FOLDER}/${opts.userId}`.toLowerCase();
  const queue = [];
  const skippedDuplicates = [];
  const oversizedItems = [];

  for (const item of preparedItems) {
    if (item.size > CONFIG.MAX_FILE_SIZE_BYTES) {
      oversizedItems.push(item);
      continue;
    }

    // Check if already completed in local resume state
    if (state.completedHashes[item.hash]) {
      skippedDuplicates.push({ ...item, reason: 'Already uploaded in previous run (local state)' });
      continue;
    }

    // Check server duplicate in user's journal folder
    const serverDup = serverDuplicateMap[item.hash];
    if (serverDup) {
      const dupFolder = (serverDup.folder || serverDup.relativePath || '').toLowerCase();
      if (dupFolder.startsWith(userPrefix) || dupFolder === userPrefix) {
        state.completedHashes[item.hash] = true;
        skippedDuplicates.push({
          ...item,
          reason: `Already on server in ${serverDup.folder} (matches "${serverDup.original_filename || serverDup.filename}")`,
        });
        continue;
      }
    }

    queue.push(item);
  }

  saveState(stateFile, state);

  // Group by Date for reporting
  const dateGroups = {};
  for (const item of queue) {
    dateGroups[item.date] = (dateGroups[item.date] || 0) + 1;
  }

  console.log(`\n📊 Scan & Deduplication Summary:`);
  console.log(`   - Total Scanned       : ${preparedItems.length} files (${formatBytes(totalBytes)})`);
  console.log(`   - Already on Server   : ${skippedDuplicates.length} files (Skipped duplicate uploads)`);
  if (oversizedItems.length > 0) {
    console.log(`   - Oversized (>1.5 GB) : ${oversizedItems.length} files (Rejected)`);
  }
  console.log(`   - Ready for Upload    : ${queue.length} files (${formatBytes(queue.reduce((acc, f) => acc + f.size, 0))})`);
  console.log(`   - Date Folders Target : ${Object.keys(dateGroups).length} unique date(s)`);

  if (queue.length === 0) {
    console.log(`\n🎉 All files are already uploaded and synchronized! Nothing to do.\n`);
    return;
  }

  if (opts.dryRun) {
    console.log(`\n🔍 [DRY RUN] Date folder distribution sample:`);
    const sortedDates = Object.keys(dateGroups).sort().slice(0, 15);
    for (const d of sortedDates) {
      console.log(`   📁 /journal/${opts.userId}/${d} ➔ ${dateGroups[d]} file(s)`);
    }
    if (Object.keys(dateGroups).length > 15) {
      console.log(`   ... and ${Object.keys(dateGroups).length - 15} more date folders.`);
    }
    console.log(`\n✅ Dry run completed successfully. Remove --dry-run to start actual upload.\n`);
    return;
  }

  // Step 4: Execute Batch Uploads Grouped by Date Folder
  console.log(`\n🚀 Starting Streamed Upload to PiStorage...`);
  const uploadStartTime = Date.now();
  let uploadedCount = 0;
  let uploadedBytes = 0;
  let failedCount = 0;
  const queueTotalBytes = queue.reduce((acc, f) => acc + f.size, 0);

  // Group queue by date
  const queueByDate = {};
  for (const item of queue) {
    if (!queueByDate[item.date]) queueByDate[item.date] = [];
    queueByDate[item.date].push(item);
  }

  const dateList = Object.keys(queueByDate).sort();

  for (const date of dateList) {
    const itemsForDate = queueByDate[date];
    const targetFolder = `${CONFIG.DEFAULT_FOLDER}/${opts.userId}/${date}`;

    for (let i = 0; i < itemsForDate.length; i += opts.batchSize) {
      const chunk = itemsForDate.slice(i, i + opts.batchSize);
      const chunkSize = chunk.reduce((acc, f) => acc + f.size, 0);

      try {
        await uploader.uploadChunk(targetFolder, chunk);

        for (const item of chunk) {
          state.completedHashes[item.hash] = true;
        }
        saveState(stateFile, state);

        uploadedCount += chunk.length;
        uploadedBytes += chunkSize;

        const pct = ((uploadedBytes / queueTotalBytes) * 100).toFixed(1);
        const elapsedSec = Math.max((Date.now() - uploadStartTime) / 1000, 0.1);
        const speedMbps = (uploadedBytes / (1024 * 1024) / elapsedSec).toFixed(1);
        const remainingBytes = queueTotalBytes - uploadedBytes;
        const etaSec = remainingBytes / (uploadedBytes / elapsedSec);

        process.stdout.write(
          `\r   ⬆️ [${uploadedCount}/${queue.length}] ${pct}% (${formatBytes(uploadedBytes)}/${formatBytes(queueTotalBytes)}) | Speed: ${speedMbps} MB/s | ETA: ${formatDuration(etaSec * 1000)}   `
        );

        // Throttle slightly between requests to respect rate limits
        await sleep(100);
      } catch (err) {
        failedCount += chunk.length;
        console.error(`\n❌ Error uploading chunk to ${targetFolder}: ${err.message}`);
      }
    }
  }

  const totalTime = Date.now() - uploadStartTime;
  console.log(`\n\n===================================================================`);
  console.log(` 🎉 Upload Process Finished in ${formatDuration(totalTime)}!`);
  console.log(`===================================================================`);
  console.log(`   ✅ Successfully Uploaded : ${uploadedCount} files (${formatBytes(uploadedBytes)})`);
  console.log(`   ⏭️ Skipped Duplicates    : ${skippedDuplicates.length} files`);
  if (failedCount > 0) {
    console.log(`   ❌ Failed Files          : ${failedCount} files (run again to retry failed items)`);
  }
  console.log(`   📁 Memories Root         : ${CONFIG.DEFAULT_FOLDER}/${opts.userId}/`);
  console.log(`===================================================================\n`);
}

main().catch((err) => {
  console.error('\n💥 Fatal Error:', err.message || err);
  process.exit(1);
});
