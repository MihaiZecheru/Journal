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

/**
 * Extracts the photo creation/capture date from EXIF metadata, filename patterns,
 * or file modification timestamp, strictly normalized to America/Los_Angeles (US Pacific Time).
 * Returns date in 'YYYY-MM-DD' format.
 */
export async function getPhotoDate(file: File): Promise<string> {
  // 1. Try reading EXIF metadata
  try {
    const tags = await ExifReader.load(file);
    const dateTag =
      tags['DateTimeOriginal'] ||
      tags['CreateDate'] ||
      tags['DateTimeDigitized'] ||
      tags['DateTime'] ||
      tags['DateCreated'];

    if (dateTag) {
      const rawVal = dateTag.description || dateTag.value;
      const dateStr = Array.isArray(rawVal) ? rawVal.join('') : String(rawVal || '').trim();

      // Check if timezone offset is also provided
      const offsetTag = tags['OffsetTimeOriginal'] || tags['OffsetTime'] || tags['OffsetTimeDigitized'];
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
    }
  } catch (err) {
    console.warn('Could not read EXIF data for file:', file.name, err);
  }

  // 2. Try parsing date from filename
  if (file.name) {
    // Check YYYY-MM-DD or YYYY_MM_DD
    const isoMatch = file.name.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      const mNum = parseInt(month, 10);
      const dNum = parseInt(day, 10);
      if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
        return `${year}-${month}-${day}`;
      }
    }

    // Check compact YYYYMMDD (e.g., IMG_20260823_142000 or 20260823)
    const compactMatch = file.name.match(/(?:IMG_|PXL_|VID_)?(\d{4})(\d{2})(\d{2})/);
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
    const mmmMatch = file.name.match(/([a-zA-Z]{3,9})[-_\s](\d{1,2})[-_\s](\d{4})/);
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
  }

  // 3. Fallback to file modification timestamp, strictly converted to America/Los_Angeles
  return toLosAngelesDateString(new Date(file.lastModified));
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Converts a YYYY-MM-DD date string to MMM-DD-YYYY format (e.g., '2026-08-23' -> 'Aug-23-2026')
 */
export function formatDateForFileName(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parts[2];
  const monthName = MONTH_NAMES[monthIdx] || parts[1];
  return `${monthName}-${day}-${year}`;
}

/**
 * Formats YYYY-MM-DD as "August 28th, 2024"
 */
export function formatDateOrdinal(dateStr: string): string {
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
