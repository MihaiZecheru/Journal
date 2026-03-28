import { useEffect, useRef, useState } from "react";
import Entry from "../database/Entry";
import { UserID } from "../database/ID";
import { GetUserID } from "../database/GetUser";
import Loading from "./Loading";
import supabase from "../database/config/supabase";
import { useNavigate } from "react-router-dom";
import '../styles/search.css';

const COLORS = ['#FF3B30', '#FF6835', '#FF9F00', '#FFD000', '#F5F000', '#BCEC00', '#72D900', '#2DBD55', '#00B84C', '#30E070', '#bdbdbd']; // gray at the end

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
// months are 1-indexed; endMonth0 is 0-indexed (for comparing against Date.getMonth())
const SEASONS: Record<string, { months: number[]; endMonth0: number }> = {
  spring: { months: [3, 4, 5],    endMonth0: 4  },
  summer: { months: [6, 7, 8],    endMonth0: 7  },
  fall:   { months: [9, 10, 11],  endMonth0: 10 },
  autumn: { months: [9, 10, 11],  endMonth0: 10 },
  winter: { months: [12, 1, 2],   endMonth0: 1  }, // Dec of year Y, Jan+Feb of year Y+1
};

async function GetAllUserEntries(user_id: UserID): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('Entries')
    .select('*')
    .eq('user_id', user_id)
    .order('date', { ascending: true });

  if (error) {
    alert("ERROR getting all user entries from database: " + error.message);
    throw error;
  }

  return data;
}

const sortByDate = (entries: Entry[], ascending: boolean) => {
  return [...entries].sort((a, b) =>
    ascending
      ? a.date.localeCompare(b.date)
      : b.date.localeCompare(a.date)
  );
};

function isDateSearch(str: string): boolean {
  return /^[\d-]+$/.test(str);
}

// ─── AI search ───────────────────────────────────────────────────────

async function expandSearchKeywords(question: string, signal: AbortSignal): Promise<string[]> {
  const res = await fetch('https://journal.mzecheru.com/api/generate-search-keywords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    signal,
  });
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const data = await res.json();
  return data.keywords as string[];
}

function filterEntriesByKeywords(entries: Entry[], keywords: string[]): Entry[] {
  const lower = keywords.map(k => k.toLowerCase());
  return entries.filter(e =>
    lower.some(kw => e.journal_entry.toLowerCase().includes(kw))
  );
}

async function runAiSearch(question: string, entries: Entry[], signal: AbortSignal): Promise<string> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 120_000);
  const combined = new AbortController();
  const abort = () => combined.abort();
  signal.addEventListener('abort', abort);
  timeoutController.signal.addEventListener('abort', abort);

  try {
    const res = await fetch('https://journal.mzecheru.com/api/ai-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        entries: entries.map(e => ({ date: e.date, entry: e.journal_entry })),
      }),
      signal: combined.signal,
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    return data.answer;
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener('abort', abort);
    timeoutController.signal.removeEventListener('abort', abort);
  }
}

// ─── Time-based entry filter ──────────────────────────────────────────

function getTimeFilteredEntries(question: string, allEntries: Entry[]): Entry[] | null {
  const q = question.toLowerCase();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  if (q.includes('this month')) {
    return allEntries.filter(e => e.date.startsWith(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`));
  }

  if (q.includes('last month')) {
    const y = currentMonth === 0 ? currentYear - 1 : currentYear;
    const m = currentMonth === 0 ? 12 : currentMonth;
    return allEntries.filter(e => e.date.startsWith(`${y}-${String(m).padStart(2, '0')}`));
  }

  if (q.includes('this year')) {
    return allEntries.filter(e => e.date.startsWith(String(currentYear)));
  }

  if (q.includes('last year')) {
    return allEntries.filter(e => e.date.startsWith(String(currentYear - 1)));
  }

  if (q.includes('this week')) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return allEntries.filter(e => new Date(e.date + 'T12:00:00') >= weekStart);
  }

  if (q.includes('last week')) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return allEntries.filter(e => {
      const d = new Date(e.date + 'T12:00:00');
      return d >= weekStart && d < weekEnd;
    });
  }

  // Month name detection ("this march", "last march", "in march", "march 2025", plain "march")
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (!q.includes(MONTH_NAMES[i])) continue;

    // Explicit year: "march 2025" or "2025 march"
    const yearMatch = q.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      const monthStr = String(i + 1).padStart(2, '0');
      return allEntries.filter(e => e.date.startsWith(`${yearMatch[1]}-${monthStr}`));
    }

    // "last <month>" → most recent past occurrence
    if (q.includes(`last ${MONTH_NAMES[i]}`)) {
      const year = i >= currentMonth ? currentYear - 1 : currentYear;
      const monthStr = String(i + 1).padStart(2, '0');
      return allEntries.filter(e => e.date.startsWith(`${year}-${monthStr}`));
    }

    // "this <month>" or plain month name → current or most recent occurrence
    const year = i > currentMonth ? currentYear - 1 : currentYear;
    const monthStr = String(i + 1).padStart(2, '0');
    return allEntries.filter(e => e.date.startsWith(`${year}-${monthStr}`));
  }

  // Season detection ("last summer", "this winter", "summer 2025", "in the fall", etc.)
  for (const [season, { months, endMonth0 }] of Object.entries(SEASONS)) {
    if (!new RegExp(`\\b${season}\\b`).test(q)) continue;

    const yearMatch = q.match(/\b(20\d{2})\b/);

    const filterBySeason = (targetYear: number) =>
      allEntries.filter(e => {
        const [y, m] = e.date.split('-').map(Number);
        if (season === 'winter') {
          return (y === targetYear && m === 12) || (y === targetYear + 1 && (m === 1 || m === 2));
        }
        return y === targetYear && months.includes(m);
      });

    if (yearMatch) {
      return filterBySeason(Number(yearMatch[1]));
    }

    const isThis = q.includes(`this ${season}`);
    let targetYear: number;

    if (season === 'winter') {
      if (isThis) {
        targetYear = currentMonth === 11 ? currentYear : currentYear - 1;
      } else {
        // most recent completed winter
        targetYear = currentMonth <= 1 ? currentYear - 2 : currentYear - 1;
      }
    } else {
      targetYear = isThis ? currentYear : (currentMonth > endMonth0 ? currentYear : currentYear - 1);
    }

    return filterBySeason(targetYear);
  }

  // Standalone year: "in 2024", "during 2025"
  const yearOnly = q.match(/\b(20\d{2})\b/);
  if (yearOnly) {
    return allEntries.filter(e => e.date.startsWith(yearOnly[1]));
  }

  return null;
}

// ─── Markdown parser (bold only) ─────────────────────────────────────

function parseMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let key = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(<b key={key++}>{match[1]}</b>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

// ─── Boolean query parser ─────────────────────────────────────────────

type BoolToken =
  | { type: 'AND' | 'OR' | 'LPAREN' | 'RPAREN' }
  | { type: 'WORD'; value: string };

type BoolExpr =
  | { type: 'WORD'; value: string }
  | { type: 'AND' | 'OR'; left: BoolExpr; right: BoolExpr };

function tokenizeQuery(query: string): BoolToken[] {
  const tokens: BoolToken[] = [];
  for (const part of query.trim().split(/\s+/)) {
    const upper = part.toUpperCase();
    if (upper === 'AND') { tokens.push({ type: 'AND' }); continue; }
    if (upper === 'OR')  { tokens.push({ type: 'OR' });  continue; }

    let s = part;
    const leading: BoolToken[] = [];
    const trailing: BoolToken[] = [];
    while (s.startsWith('(')) { leading.push({ type: 'LPAREN' }); s = s.slice(1); }
    while (s.endsWith(')'))   { trailing.unshift({ type: 'RPAREN' }); s = s.slice(0, -1); }

    tokens.push(...leading);
    if (s) tokens.push({ type: 'WORD', value: s.toLowerCase() });
    tokens.push(...trailing);
  }
  return tokens;
}

function parseBoolQuery(tokens: BoolToken[]): BoolExpr {
  let pos = 0;
  const peek = () => tokens[pos] ?? null;
  const consume = () => tokens[pos++];

  const parseOr = (): BoolExpr => {
    let left = parseAnd();
    while (peek()?.type === 'OR') { consume(); left = { type: 'OR', left, right: parseAnd() }; }
    return left;
  };

  const parseAnd = (): BoolExpr => {
    let left = parseFactor();
    while (peek()?.type === 'AND') { consume(); left = { type: 'AND', left, right: parseFactor() }; }
    return left;
  };

  const parseFactor = (): BoolExpr => {
    const t = peek();
    if (!t) throw new Error('Unexpected end of query');
    if (t.type === 'LPAREN') {
      consume();
      const expr = parseOr();
      if (peek()?.type === 'RPAREN') consume();
      return expr;
    }
    if (t.type === 'WORD') { consume(); return { type: 'WORD', value: t.value }; }
    throw new Error(`Unexpected token: ${t.type}`);
  };

  return parseOr();
}

function evalBoolExpr(expr: BoolExpr, text: string): boolean {
  if (expr.type === 'WORD') return text.includes(expr.value);
  if (expr.type === 'AND')  return evalBoolExpr(expr.left, text) && evalBoolExpr(expr.right, text);
  return evalBoolExpr(expr.left, text) || evalBoolExpr(expr.right, text);
}

function matchesQuery(entry: Entry, rawQuery: string): boolean {
  try {
    const tokens = tokenizeQuery(rawQuery);
    if (!tokens.length) return false;
    return evalBoolExpr(parseBoolQuery(tokens), entry.journal_entry.toLowerCase());
  } catch {
    return entry.journal_entry.toLowerCase().includes(rawQuery.toLowerCase());
  }
}

const Search = () => {
  const searchBox = useRef<HTMLInputElement>(null);
  const [searchResults, setSearchResults] = useState<Entry[] | null>(null);
  const [allEntries, setAllEntries] = useState<Entry[]>();
  const [loading, setLoading] = useState<boolean>(true);
  const [sortByAscending, setSortByAscending] = useState<boolean>(true);
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [expandableIndices, setExpandableIndices] = useState<Set<number>>(new Set());
  const [showInfo, setShowInfo] = useState(false);
  const [isAiMode, setIsAiMode] = useState(false);
  const [preferNewer, setPreferNewer] = useState(true);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiProgress, setAiProgress] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressCeilingRef = useRef(28);
  const bodyRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const infoAreaRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      GetAllUserEntries(await GetUserID()).then((entries: Entry[]) => {
        setAllEntries(entries);
        setLoading(false);
        searchBox.current?.focus();
      });
    })();
  }, []);

  useEffect(() => {
    if (!showInfo) return;
    const handler = (e: MouseEvent) => {
      if (infoAreaRef.current && !infoAreaRef.current.contains(e.target as Node)) {
        setShowInfo(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showInfo]);

  useEffect(() => {
    if (!aiLoading) return;
    const id = setInterval(() => {
      setAiProgress(prev => {
        const ceiling = progressCeilingRef.current;
        return prev + 0.5 < ceiling ? prev + 0.5 : prev;
      });
    }, 100);
    return () => clearInterval(id);
  }, [aiLoading]);

  useEffect(() => {
    if (!searchResults) return;
    const expandable = new Set<number>();
    bodyRefs.current.forEach((el, index) => {
      if (el && el.scrollHeight > el.clientHeight) {
        expandable.add(index);
      }
    });
    setExpandableIndices(expandable);
  }, [searchResults]);

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAiMode && e.target.value.toLowerCase().startsWith('/ai ')) {
      setIsAiMode(true);
      searchBox.current!.value = e.target.value.slice(4);
    }
  };

  const exitAiMode = () => {
    setIsAiMode(false);
    if (searchBox.current) searchBox.current.value = '';
    searchBox.current?.focus();
  };

  const searchBoxOnKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && isAiMode && searchBox.current!.value === '') {
      exitAiMode();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const search_query = searchBox.current!.value.trim();
      setExpandedIndices(new Set());
      setExpandableIndices(new Set());
      setShowInfo(false);

      const q = search_query.toLowerCase();

      if (isAiMode || q.startsWith('/ai ') || q === '/ai') {
        const question = isAiMode ? search_query : search_query.slice(4).trim();
        if (!question) return;
        setSearchResults(null);
        setAiResponse(null);
        setAiProgress(0);
        progressCeilingRef.current = 28;
        setAiLoading(true);
        setAiModalOpen(true);
        const controller = new AbortController();
        abortControllerRef.current = controller;
        try {
          let relevant: Entry[];
          const timeFiltered = getTimeFilteredEntries(question, allEntries!);

          const MAX_ENTRIES = 100;

          if (timeFiltered !== null && timeFiltered.length > 0) {
            // Skip keyword expansion — send all entries for that period directly
            progressCeilingRef.current = 95;
            relevant = timeFiltered.length > MAX_ENTRIES
              ? (preferNewer ? timeFiltered.slice(-MAX_ENTRIES) : timeFiltered.slice(0, MAX_ENTRIES))
              : timeFiltered;
          } else {
            const keywords = await expandSearchKeywords(question, controller.signal);
            setAiProgress(42);
            progressCeilingRef.current = 95;
            let filtered = filterEntriesByKeywords(allEntries!, keywords);
            if (filtered.length === 0) filtered = allEntries!.slice(-30);
            relevant = preferNewer ? filtered.slice(-MAX_ENTRIES) : filtered.slice(0, MAX_ENTRIES);
          }

          const answer = await runAiSearch(question, relevant, controller.signal);
          setAiProgress(100);
          setAiResponse(answer);
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          alert('AI search failed: ' + err.message);
          setAiModalOpen(false);
        } finally {
          setAiLoading(false);
        }
        return;
      }

      const monthIndex = MONTH_NAMES.indexOf(q);
      const weekdayIndex = WEEKDAY_NAMES.indexOf(q);

      if (isDateSearch(search_query)) {
        setSearchResults(sortByDate(allEntries!.filter((entry: Entry) => entry.date.includes(search_query)), sortByAscending));
      } else if (monthIndex !== -1) {
        const monthStr = String(monthIndex + 1).padStart(2, '0');
        setSearchResults(sortByDate(allEntries!.filter((entry: Entry) => entry.date.substring(5, 7) === monthStr), sortByAscending));
      } else if (weekdayIndex !== -1) {
        setSearchResults(sortByDate(allEntries!.filter((entry: Entry) => new Date(entry.date + 'T12:00:00').getDay() === weekdayIndex), sortByAscending));
      } else {
        setSearchResults(sortByDate(allEntries!.filter((entry: Entry) => matchesQuery(entry, search_query)), sortByAscending));
      }
    }
  };

  const changeSortOrder = () => {
    const newSortByAscending = !sortByAscending;
    setSortByAscending(newSortByAscending);
    setExpandableIndices(new Set());
    setSearchResults(sortByDate(searchResults || [], newSortByAscending));
  };

  const closeAiModal = () => {
    abortControllerRef.current?.abort();
    setAiModalOpen(false);
    setAiLoading(false);
    setAiResponse(null);
  };

  const toggleExpanded = (index: number) => {
    setExpandedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (loading) {
    return <Loading />;
  }

  const headerClass = searchResults === null ? 'search-header-centered' : 'search-header';

  return (
    <div className="search-bg">
      <div className={headerClass}>
        <button className="search-home-btn" onClick={() => navigate('/home')}>
          <i className="fas fa-home"></i> Home
        </button>

        <div className="search-info-area" ref={infoAreaRef}>
          <div className="search-input-wrap">
            {isAiMode
              ? <span className="search-ai-badge" onClick={exitAiMode}><i className="fas fa-robot"></i> AI</span>
              : <i className="fas fa-search"></i>
            }
            <input
              type="text"
              id="search-box"
              className={isAiMode ? 'ai-mode' : ''}
              ref={searchBox}
              placeholder={isAiMode ? 'Ask a question…' : 'Search entries…'}
              onKeyDown={searchBoxOnKeyDown}
              onChange={handleSearchInput}
            />
          </div>
          <button className="search-info-btn" onClick={() => setShowInfo(p => !p)} aria-label="Search help">
            <i className="fas fa-circle-info"></i>
          </button>
          {showInfo && (
            <div className="search-info-popup">
              <p className="search-info-title">How to search</p>
              <ul className="search-info-list">
                <li>Type any word or phrase and press <code>Enter</code></li>
                <li>Boolean logic: <code>beach AND sunset</code></li>
                <li>Grouping: <code>(beach OR pool) AND watermelon</code></li>
                <li>Search by month: <code>March</code>, <code>September</code></li>
                <li>Search by weekday: <code>Monday</code>, <code>Friday</code></li>
                <li>Search by year or partial date: <code>2024</code>, <code>2024-03</code></li>
                <li><code>AND</code> / <code>OR</code> are case-insensitive</li>
                <li>AI search: <code>/ai when did I last go to the doctor?</code></li>
              </ul>
            </div>
          )}
        </div>

        {isAiMode && (
          <div className="search-sort-toggle">
            <span className="ai-pref-label">{preferNewer ? 'Newer' : 'Older'}</span>
            <button
              className={`ai-pref-slider${preferNewer ? ' newer' : ' older'}`}
              onClick={() => setPreferNewer(p => !p)}
              aria-label="Toggle entry preference"
              title="Controls whether the AI pulls from your newer or older entries when searching"
            />
          </div>
        )}

        <div className="search-sort-toggle">
          <input
            className="search-sort-checkbox"
            type="checkbox"
            id="ascending-switch"
            checked={sortByAscending}
            onClick={changeSortOrder}
            readOnly
          />
          <label htmlFor="ascending-switch">Ascending</label>
        </div>
      </div>

      {aiModalOpen && (
        <div className="ai-modal-overlay">
          <div className="ai-modal">
            <div className="ai-modal-header">
              <i className="fas fa-robot"></i>
              <span>AI Search</span>
            </div>
            <div className="ai-modal-body">
              {aiLoading ? (
                <>
                  <p className="ai-modal-status">Searching your journal…</p>
                  <div className="ai-modal-progress">
                    <div className="ai-modal-progress-bar" style={{ width: `${aiProgress}%` }}></div>
                  </div>
                </>
              ) : (
                <p className="ai-modal-response">{parseMarkdown(aiResponse!)}</p>
              )}
            </div>
            <div className="ai-modal-footer">
              <button className="ai-modal-close-btn" onClick={closeAiModal}>
                {aiLoading ? 'Cancel' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {searchResults && (
        <div className="search-results">
          <p className="search-result-count">
            {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'} found
          </p>
          {searchResults.map((entry, index) => {
            const color = COLORS[entry.rating - 1];
            const ratingLabel = entry.rating === 11 ? 'No rating' : `${entry.rating} / 10`;
            const isExpanded = expandedIndices.has(index);
            return (
              <div
                key={index}
                className="search-result-card"
                style={{ borderLeftColor: color, cursor: expandableIndices.has(index) ? 'pointer' : 'default' }}
                onClick={() => expandableIndices.has(index) && toggleExpanded(index)}
              >
                <div className="search-result-header">
                  <span className="search-result-date" style={{ color }}>
                    {entry.date}
                  </span>
                  {entry.starred && <i className="fas fa-star search-result-star"></i>}
                  <span className="search-result-rating" style={{ color }}>{ratingLabel}</span>
                  {expandableIndices.has(index) && (
                    <i className={`fas fa-chevron-down search-result-chevron ${isExpanded ? 'search-result-chevron--up' : ''}`}></i>
                  )}
                </div>
                <p
                  className={`search-result-body ${isExpanded ? 'search-result-body--expanded' : ''}`}
                  ref={el => { bodyRefs.current[index] = el; }}
                >
                  {entry.journal_entry}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Search;
