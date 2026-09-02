import {
  formatDateForFileName,
  formatDateOrdinal,
  generateMemoriesFileName,
  parseDateFromFilename,
  getPhotoDateDetails,
  UNKNOWN_DATE_FOLDER,
} from './exifUtils';
import ExifReader from 'exifreader';

jest.mock('exifreader', () => ({
  load: jest.fn(),
}));

describe('exifUtils file naming & date formatting tests', () => {
  test('formatDateForFileName formats YYYY-MM-DD to MMM-DD-YYYY', () => {
    expect(formatDateForFileName('2026-08-23')).toBe('Aug-23-2026');
    expect(formatDateForFileName('2024-01-05')).toBe('Jan-05-2024');
    expect(formatDateForFileName('2025-12-31')).toBe('Dec-31-2025');
    expect(formatDateForFileName('Unknown-Date')).toBe('Unknown-Date');
    expect(formatDateForFileName('Unknown')).toBe('Unknown-Date');
  });

  test('formatDateOrdinal formats YYYY-MM-DD as Month DDth, YYYY', () => {
    expect(formatDateOrdinal('2024-08-28')).toBe('August 28th, 2024');
    expect(formatDateOrdinal('2024-08-01')).toBe('August 1st, 2024');
    expect(formatDateOrdinal('2024-08-02')).toBe('August 2nd, 2024');
    expect(formatDateOrdinal('2024-08-03')).toBe('August 3rd, 2024');
    expect(formatDateOrdinal('2024-08-11')).toBe('August 11th, 2024');
    expect(formatDateOrdinal('2024-08-21')).toBe('August 21st, 2024');
    expect(formatDateOrdinal('2024-08-22')).toBe('August 22nd, 2024');
    expect(formatDateOrdinal('2024-08-23')).toBe('August 23rd, 2024');
    expect(formatDateOrdinal('Unknown-Date')).toBe('Unknown Date');
    expect(formatDateOrdinal('Unknown')).toBe('Unknown Date');
  });

  test('generateMemoriesFileName produces correct naming format', () => {
    const userID = 'fe9f8d37-7849-4721-8ea1-1c192486b942';
    const dateStr = '2026-08-23';
    
    // First picture on that date
    const name1 = generateMemoriesFileName(userID, dateStr, 0, 1, 'my_photo.jpg');
    expect(name1).toBe('fe9f8d37-7849-4721-8ea1-1c192486b942_Aug-23-2026_0001.jpg');

    // Second picture on that date
    const name2 = generateMemoriesFileName(userID, dateStr, 0, 2, 'IMAGE.PNG');
    expect(name2).toBe('fe9f8d37-7849-4721-8ea1-1c192486b942_Aug-23-2026_0002.png');

    // When 3 pictures already exist on that date
    const name3 = generateMemoriesFileName(userID, dateStr, 3, 1, 'camera.heic');
    expect(name3).toBe('fe9f8d37-7849-4721-8ea1-1c192486b942_Aug-23-2026_0004.heic');
  });

  test('parseDateFromFilename correctly extracts dates from various filename patterns', () => {
    expect(parseDateFromFilename('pool-2024-07-15.jpg')).toBe('2024-07-15');
    expect(parseDateFromFilename('IMG_20230820_142300.jpg')).toBe('2023-08-20');
    expect(parseDateFromFilename('Aug-23-2024_0001.jpg')).toBe('2024-08-23');
    expect(parseDateFromFilename('random_picture.png')).toBeNull();
  });

  test('getPhotoDateDetails marks isOriginalDate=true strictly for DateTimeOriginal or CreateDate', async () => {
    const mockLoad = ExifReader.load as jest.Mock;

    // Case 1: DateTimeOriginal present -> isOriginalDate = true
    mockLoad.mockResolvedValueOnce({
      DateTimeOriginal: { description: '2024:07:15 14:30:00' },
    });
    const file1 = new File([''], 'pool.jpg', { lastModified: 1725200000000 });
    const res1 = await getPhotoDateDetails(file1);
    expect(res1.isOriginalDate).toBe(true);
    expect(res1.date).toBe('2024-07-15');
    expect(res1.source).toBe('DateTimeOriginal');

    // Case 2: CreateDate present -> isOriginalDate = true
    mockLoad.mockResolvedValueOnce({
      CreateDate: { description: '2024:06:10 11:00:00' },
    });
    const file2 = new File([''], 'vacation.jpg', { lastModified: 1725200000000 });
    const res2 = await getPhotoDateDetails(file2);
    expect(res2.isOriginalDate).toBe(true);
    expect(res2.date).toBe('2024-06-10');
    expect(res2.source).toBe('CreateDate');

    // Case 3: Only DateTime (modification date) present -> isOriginalDate = false
    mockLoad.mockResolvedValueOnce({
      DateTime: { description: '2026:09:01 10:00:00' },
    });
    const file3 = new File([''], 'edited_photo.jpg', { lastModified: 1725200000000 });
    const res3 = await getPhotoDateDetails(file3);
    expect(res3.isOriginalDate).toBe(false);
    expect(res3.date).toBe('2026-09-01');
    expect(res3.source).toBe('DateTime');

    // Case 4: No EXIF, date parsed from filename -> isOriginalDate = false
    mockLoad.mockResolvedValueOnce({});
    const file4 = new File([''], 'IMG_20230820_120000.jpg', { lastModified: 1725200000000 });
    const res4 = await getPhotoDateDetails(file4);
    expect(res4.isOriginalDate).toBe(false);
    expect(res4.date).toBe('2023-08-20');
    expect(res4.source).toBe('filename');

    // Case 5: No EXIF, no date in filename -> falls back to lastModified with isOriginalDate = false
    mockLoad.mockResolvedValueOnce({});
    const file5 = new File([''], 'me_at_pool.jpg', { lastModified: 1700000000000 });
    const res5 = await getPhotoDateDetails(file5);
    expect(res5.isOriginalDate).toBe(false);
    expect(res5.source).toBe('lastModified');
  });
});
