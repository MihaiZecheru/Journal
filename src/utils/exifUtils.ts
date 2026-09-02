import ExifReader from 'exifreader';

/**
 * Converts any Date object to a YYYY-MM-DD string in America/Los_Angeles (US Pacific Time).
 */
export function toLosAngelesDateString(date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch (e) {
    // Fallback if Intl fails
    const pstDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const year = pstDate.getFullYear();
    const month = String(pstDate.getMonth() + 1).padStart(2, '0');
    const day = String(pstDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Parses date string from an EXIF tag and adjusts for timezone offset if present.
 */
function parseExifDateTag(
  dateTag: any,
  tags: Record<string, any>,
  specificOffsetKeys: string[] = []
): string | null {
  if (!dateTag) return null;
  const rawVal = dateTag.description || dateTag.value;
  const dateStr = Array.isArray(rawVal) ? rawVal.join('') : String(rawVal || '').trim();
  if (!dateStr) return null;

  // Check if timezone offset is also provided
  let offsetTag: any = null;
  for (const key of specificOffsetKeys) {
    if (tags[key]) {
      offsetTag = tags[key];
      break;
    }
  }
  if (!offsetTag) {
    offsetTag = tags['OffsetTimeOriginal'] || tags['OffsetTime'] || tags['OffsetTimeDigitized'];
  }
  const offsetStr = offsetTag ? String(offsetTag.description || offsetTag.value || '').trim() : '';

  // Pattern: "YYYY:MM:DD HH:MM:SS" or "YYYY-MM-DD HH:MM:SS"
  const matchWithTime = dateStr.match(/^(\d{4})[:\-/](\d{2})[:\-/](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (matchWithTime && offsetStr && /^[+-]\d{2}:\d{2}$/.test(offsetStr)) {
    const [, yr, mo, da, hr, mi, se] = matchWithTime;
    const isoWithOffset = `${yr}-${mo}-${da}T${hr}:${mi}:${se}${offsetStr}`;
    const parsedDate = new Date(isoWithOffset);
    if (!isNaN(parsedDate.getTime())) {
      return toLosAngelesDateString(parsedDate);
    }
  }

  const match = dateStr.match(/^(\d{4})[:\-/](\d{2})[:\-/](\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Tries parsing date patterns from a file name.
 */
export function parseDateFromFilename(fileName: string): string | null {
  if (!fileName) return null;

  // Check YYYY-MM-DD or YYYY_MM_DD
  const isoMatch = fileName.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const mNum = parseInt(month, 10);
    const dNum = parseInt(day, 10);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${year}-${month}-${day}`;
    }
  }

  // Check compact YYYYMMDD (e.g., IMG_20260823_142000 or 20260823)
  const compactMatch = fileName.match(/(?:IMG_|PXL_|VID_)?(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    const [, year, month, day] = compactMatch;
    const yNum = parseInt(year, 10);
    const mNum = parseInt(month, 10);
    const dNum = parseInt(day, 10);
    if (yNum >= 2000 && yNum <= 2100 && mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${year}-${month}-${day}`;
    }
  }

  // Check Month-DD-YYYY or Month DD YYYY (e.g., Aug-23-2026)
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

export type PhotoDateSource =
  | 'DateTimeOriginal'
  | 'CreateDate'
  | 'DateTimeDigitized'
  | 'DateTime'
  | 'DateCreated'
  | 'filename'
  | 'lastModified';

export interface PhotoDateResult {
  date: string;
  /**
   * True strictly if the date was read from DateTimeOriginal or CreateDate.
   * False if fallback EXIF tags, filename heuristics, or lastModified timestamp were used.
   */
  isOriginalDate: boolean;
  source: PhotoDateSource;
}

/**
 * Extracts photo creation/capture date along with metadata about whether it came from
 * camera capture tags (DateTimeOriginal / CreateDate) or fallback sources.
 */
export async function getPhotoDateDetails(file: File): Promise<PhotoDateResult> {
  // 1. Try reading EXIF metadata
  try {
    const tags = (await ExifReader.load(file)) as Record<string, any>;

    // Priority 1: DateTimeOriginal (exact camera capture date/time)
    if (tags['DateTimeOriginal']) {
      const parsed = parseExifDateTag(tags['DateTimeOriginal'], tags, ['OffsetTimeOriginal', 'OffsetTime']);
      if (parsed) {
        return { date: parsed, isOriginalDate: true, source: 'DateTimeOriginal' };
      }
    }

    // Priority 2: CreateDate (exact digital creation date)
    if (tags['CreateDate']) {
      const parsed = parseExifDateTag(tags['CreateDate'], tags, ['OffsetTimeOriginal', 'OffsetTime']);
      if (parsed) {
        return { date: parsed, isOriginalDate: true, source: 'CreateDate' };
      }
    }

    // Priority 3: Fallback EXIF tags (Digitized, Modification DateTime, IPTC DateCreated)
    const fallbackExifKeys: Array<'DateTimeDigitized' | 'DateTime' | 'DateCreated'> = [
      'DateTimeDigitized',
      'DateTime',
      'DateCreated',
    ];
    for (const key of fallbackExifKeys) {
      if (tags[key]) {
        const parsed = parseExifDateTag(tags[key], tags);
        if (parsed) {
          return { date: parsed, isOriginalDate: false, source: key };
        }
      }
    }
  } catch (err) {
    console.warn('Could not read EXIF data for file:', file.name, err);
  }

  // 2. Try parsing date from filename
  if (file.name) {
    const filenameDate = parseDateFromFilename(file.name);
    if (filenameDate) {
      return { date: filenameDate, isOriginalDate: false, source: 'filename' };
    }
  }

  // 3. Fallback to file modification timestamp, strictly converted to America/Los_Angeles
  return {
    date: toLosAngelesDateString(new Date(file.lastModified)),
    isOriginalDate: false,
    source: 'lastModified',
  };
}

/**
 * Extracts the photo creation/capture date from EXIF metadata, filename patterns,
 * or file modification timestamp, strictly normalized to America/Los_Angeles (US Pacific Time).
 * Returns date in 'YYYY-MM-DD' format.
 */
export async function getPhotoDate(file: File): Promise<string> {
  const result = await getPhotoDateDetails(file);
  return result.date;
}

export const UNKNOWN_DATE_FOLDER = 'Unknown-Date';

/**
 * Converts a YYYY-MM-DD date string to MMM-DD-YYYY format (e.g., '2026-08-23' -> 'Aug-23-2026').
 * For 'Unknown-Date' or 'Unknown', returns 'Unknown-Date'.
 */
export function formatDateForFileName(dateStr: string): string {
  if (!dateStr || dateStr === 'Unknown-Date' || dateStr === 'Unknown') {
    return UNKNOWN_DATE_FOLDER;
  }
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parts[2];
  const monthName = MONTH_NAMES[monthIdx] || parts[1];
  return `${monthName}-${day}-${year}`;
}

/**
 * Formats YYYY-MM-DD as "August 28th, 2024".
 * For 'Unknown-Date' or 'Unknown', returns "Unknown Date".
 */
export function formatDateOrdinal(dateStr: string): string {
  if (!dateStr || dateStr === 'Unknown-Date' || dateStr === 'Unknown') {
    return 'Unknown Date';
  }
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const dayNum = parseInt(parts[2], 10);
  const monthName = FULL_MONTH_NAMES[monthIdx] || parts[1];

  let suffix = 'th';
  if (dayNum % 10 === 1 && dayNum !== 11) suffix = 'st';
  else if (dayNum % 10 === 2 && dayNum !== 12) suffix = 'nd';
  else if (dayNum % 10 === 3 && dayNum !== 13) suffix = 'rd';

  return `${monthName} ${dayNum}${suffix}, ${year}`;
}

/**
 * Generates a photo filename based on user specification:
 * format: {userID}_{MMM-DD-YYYY}_{000N}.{ext}
 * Example: fe9f8d37-7849-4721-8ea1-1c192486b942_Aug-23-2026_0001.jpg
 */
export function generateMemoriesFileName(
  userID: string,
  dateStr: string,
  existingCount: number,
  sequenceIndex: number,
  originalFilename: string
): string {
  const formattedDate = formatDateForFileName(dateStr);
  const numberPadded = String(existingCount + sequenceIndex).padStart(4, '0');
  
  let ext = 'jpg';
  if (originalFilename && originalFilename.includes('.')) {
    const parts = originalFilename.split('.');
    ext = parts[parts.length - 1].toLowerCase();
  }

  return `${userID}_${formattedDate}_${numberPadded}.${ext}`;
}
