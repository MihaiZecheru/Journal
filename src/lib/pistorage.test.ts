import { PiStorageClient, computeSha256 } from './pistorage';
import { TextEncoder } from 'util';

describe('PiStorage SHA-256 and Deduplication', () => {
  beforeEach(() => {
    // Reset fetch mock
    (globalThis as any).fetch = jest.fn();
    if (typeof (globalThis as any).TextEncoder === 'undefined') {
      (globalThis as any).TextEncoder = TextEncoder;
    }
  });

  describe('computeSha256', () => {
    it('computes correct SHA-256 hash for Uint8Array / ArrayBuffer', async () => {
      // SHA-256 of "hello world" is b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
      const encoder = new TextEncoder();
      const buffer = encoder.encode('hello world');
      const hash = await computeSha256(buffer);
      expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });

    it('computes correct SHA-256 hash for Blob / File', async () => {
      const blob = new Blob(['hello world'], { type: 'text/plain' });
      const hash = await computeSha256(blob);
      expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });

    it('computes correct SHA-256 hash for empty content', async () => {
      // SHA-256 of empty string is e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      const emptyBuffer = new Uint8Array(0);
      const hash = await computeSha256(emptyBuffer);
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('isJournalFolder', () => {
    const client = new PiStorageClient({ defaultFolder: '/journal' });

    it('returns true for paths inside /journal', () => {
      expect(client.isJournalFolder('/journal/user123/2026-08-10')).toBe(true);
      expect(client.isJournalFolder('journal/user123/2026-08-10')).toBe(true);
      expect(client.isJournalFolder('/JOURNAL/something')).toBe(true);
      expect(client.isJournalFolder('/journal/2026/08/photo.jpg')).toBe(true);
    });

    it('returns false for paths outside /journal', () => {
      expect(client.isJournalFolder('/other/folder')).toBe(false);
      expect(client.isJournalFolder('/wallpapers/nature.jpg')).toBe(false);
      expect(client.isJournalFolder('')).toBe(false);
    });
  });

  describe('checkHashes', () => {
    it('calls /api/check-hashes with the provided hashes', async () => {
      const mockDuplicates = {
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9': {
          id: 1,
          filename: 'test.jpg',
          original_filename: 'test.jpg',
          folder: '/journal/user1/2026-08-10',
          relativePath: '/journal/user1/2026-08-10/test.jpg',
          file_url: '/view/journal/user1/2026-08-10/test.jpg',
          thumbnail_url: '/thumb/journal/user1/2026-08-10/test.jpg',
        },
      };

      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ duplicates: mockDuplicates }),
      });

      const client = new PiStorageClient({ baseUrl: 'https://storage.test', apiKey: 'test-key' });
      const result = await client.checkHashes(['b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9']);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://storage.test/api/check-hashes',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-API-Key': 'test-key',
          }),
          body: JSON.stringify({
            hashes: ['b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'],
          }),
        })
      );
      expect(result.duplicates).toEqual(mockDuplicates);
    });
  });

  describe('uploadFiles with Journal deduplication', () => {
    it('skips uploading duplicate file if it already exists in Journal dir', async () => {
      const client = new PiStorageClient({ baseUrl: 'https://storage.test', apiKey: 'test-key', defaultFolder: '/journal' });

      // File with known content "hello world"
      const file = new File(['hello world'], 'test.jpg', { type: 'image/jpeg' });
      const hash = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';

      // Mock check-hashes returning duplicate in Journal
      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          duplicates: {
            [hash]: {
              id: 99,
              filename: 'existing-photo.jpg',
              original_filename: 'test.jpg',
              folder: '/journal/user1/2026-08-10',
              relativePath: '/journal/user1/2026-08-10/existing-photo.jpg',
              file_url: '/view/journal/user1/2026-08-10/existing-photo.jpg',
              thumbnail_url: '/thumb/journal/user1/2026-08-10/existing-photo.jpg',
            },
          },
        }),
      });

      const res = await client.uploadFiles('/journal/user1/2026-08-10', [file]);

      // fetch should only have been called once for /api/check-hashes, NOT for /upload!
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(res.uploadedCount).toBe(1);
      expect(res.duplicates).toHaveLength(1);
      expect(res.duplicates![0].is_duplicate).toBe(true);
      expect(res.duplicates![0].filename).toBe('existing-photo.jpg');
      expect(res.files[0].sha256).toBe(hash);
    });

    it('does NOT skip uploading if duplicate is in a non-Journal dir (e.g. /other)', async () => {
      const client = new PiStorageClient({ baseUrl: 'https://storage.test', apiKey: 'test-key', defaultFolder: '/journal' });

      const file = new File(['hello world'], 'test.jpg', { type: 'image/jpeg' });
      const hash = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';

      // Mock check-hashes returning duplicate in non-Journal directory /other
      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          duplicates: {
            [hash]: {
              id: 101,
              filename: 'other-photo.jpg',
              original_filename: 'test.jpg',
              folder: '/other/wallpapers',
              relativePath: '/other/wallpapers/other-photo.jpg',
            },
          },
        }),
      });

      // Mock upload endpoint succeeding
      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: '1 of 1 files uploaded successfully',
          files: [
            {
              id: 102,
              original_filename: 'test.jpg',
              filename: 'newly-uploaded.jpg',
              sha256: hash,
              file_url: '/view/journal/user1/2026-08-10/newly-uploaded.jpg',
              thumbnail_url: '/thumb/journal/user1/2026-08-10/newly-uploaded.jpg',
            },
          ],
        }),
      });

      const res = await client.uploadFiles('/journal/user1/2026-08-10', [file]);

      // fetch should have been called twice: 1 for check-hashes, 1 for /upload
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(res.uploadedCount).toBe(1);
      expect(res.duplicates).toHaveLength(0);
      expect(res.files[0].filename).toBe('newly-uploaded.jpg');
    });
  });
});
