import { formatDateForFileName, formatDateOrdinal, generateMemoriesFileName } from './exifUtils';

describe('exifUtils file naming & date formatting tests', () => {
  test('formatDateForFileName formats YYYY-MM-DD to MMM-DD-YYYY', () => {
    expect(formatDateForFileName('2026-08-23')).toBe('Aug-23-2026');
    expect(formatDateForFileName('2024-01-05')).toBe('Jan-05-2024');
    expect(formatDateForFileName('2025-12-31')).toBe('Dec-31-2025');
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
});
