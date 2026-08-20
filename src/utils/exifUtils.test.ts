import { formatDateForFileName, generateMemoriesFileName } from './exifUtils';

describe('exifUtils file naming tests', () => {
  test('formatDateForFileName formats YYYY-MM-DD to MMM-DD-YYYY', () => {
    expect(formatDateForFileName('2026-08-23')).toBe('Aug-23-2026');
    expect(formatDateForFileName('2024-01-05')).toBe('Jan-05-2024');
    expect(formatDateForFileName('2025-12-31')).toBe('Dec-31-2025');
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

    // When 3 pictures already exist on that date, next picture sequence starts at index 4 (existingCount 3 + seqIndex 1)
    const name3 = generateMemoriesFileName(userID, dateStr, 3, 1, 'camera.heic');
    expect(name3).toBe('fe9f8d37-7849-4721-8ea1-1c192486b942_Aug-23-2026_0004.heic');
  });
});
