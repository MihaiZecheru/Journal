import ExifReader from 'exifreader';

/**
 * Extracts the photo creation/capture date from EXIF metadata.
 * Fallbacks to file.lastModified if EXIF metadata is missing or unparseable.
 * Returns date in 'YYYY-MM-DD' format.
 */
export async function getPhotoDate(file: File): Promise<string> {
  try {
    const tags = await ExifReader.load(file);
    const dateTag = tags['DateTimeOriginal'] || tags['CreateDate'] || tags['DateTimeDigitized'] || tags['DateTime'];
    
    if (dateTag && dateTag.description) {
      const dateStr = String(dateTag.description).trim();
      // Match formats like "YYYY:MM:DD HH:MM:SS" or "YYYY-MM-DD HH:MM:SS" or "YYYY/MM/DD..."
      const match = dateStr.match(/^(\d{4})[:\-\/](\d{2})[:\-\/](\d{2})/);
      if (match) {
        const [_, year, month, day] = match;
        return `${year}-${month}-${day}`;
      }
    }
  } catch (err) {
    console.warn('Could not read EXIF data for file:', file.name, err);
  }

  // Fallback to file modification timestamp
  const fallbackDate = new Date(file.lastModified);
  const year = fallbackDate.getFullYear();
  const month = String(fallbackDate.getMonth() + 1).padStart(2, '0');
  const day = String(fallbackDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
