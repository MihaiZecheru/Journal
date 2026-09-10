export interface PiStorageConfig {
  baseUrl: string;
  apiKey: string;
  defaultFolder?: string;
}

export interface UploadedMediaItem {
  id?: number;
  original_filename: string;
  filename: string;
  file_url: string;
  thumbnail_url: string;
  media_type: 'image' | 'video';
  folder: string;
  was_compressed: number;
  file_size: number;
  sha256?: string;
  is_duplicate?: boolean;
  width?: number;
  height?: number;
  date_time_original?: string;
  latitude?: number;
  longitude?: number;
  camera_make?: string;
  camera_model?: string;
  duration?: number;
}

export interface UploadFailedItem {
  original_name?: string;
  original_filename?: string;
  error: string;
}

export interface PiStorageDuplicateItem {
  id?: number;
  filename: string;
  original_filename?: string;
  folder: string;
  relativePath: string;
  file_url?: string;
  thumbnail_url?: string;
  sha256?: string;
}

export interface CheckHashesResponse {
  duplicates: Record<string, PiStorageDuplicateItem>;
}

export interface UploadResponse {
  message: string;
  targetFolder: string;
  uploadedCount: number;
  failedCount: number;
  files: UploadedMediaItem[];
  failed: UploadFailedItem[];
  duplicates?: UploadedMediaItem[];
}

export interface SignedUrlResponse {
  signedUrl: string;
  expiresAt: string;
  expiresInSeconds: number;
  fullUrl: string;
  shortUrl?: string;
  shortUrlAlias?: string;
}

export interface MoveSingleResponse {
  message: string;
  sourcePath: string;
  targetPath: string;
  targetFolder: string;
  filename: string;
  viewUrl: string;
  thumbnailUrl: string;
}

export interface MovedBatchItem {
  originalPath: string;
  newPath: string;
  filename: string;
  targetFolder: string;
  viewUrl: string;
  thumbnailUrl: string;
}

export interface FailedBatchItem {
  path: string;
  error: string;
}

export interface MoveBatchResponse {
  message: string;
  movedCount: number;
  failedCount: number;
  targetFolder: string;
  moved: MovedBatchItem[];
  failed: FailedBatchItem[];
}

export interface ListDirectoriesResponse {
  directories: string[];
}


export interface MediaFileItem {
  name: string;
  relativePath: string;
  size: number;
  isImage: boolean;
  isVideo: boolean;
  modifiedAt: string;
  viewUrl: string;
  thumbnailUrl: string;
  dbMetadata?: {
    id?: number;
    original_filename?: string;
    media_type?: string;
    sha256?: string;
    was_compressed?: number;
    width?: number;
    height?: number;
    date_time_original?: string;
    latitude?: number;
    longitude?: number;
    camera_make?: string;
    camera_model?: string;
    created_at?: string;
  } | null;
}

export interface DirectoryItem {
  name: string;
  relativePath: string;
  itemCount: number;
}

export interface DirectoryTreeResponse {
  currentPath: string;
  breadcrumbs: Array<{ name: string; path: string }>;
  directories: DirectoryItem[];
  files: MediaFileItem[];
  constants?: {
    maxBulkUploadAmount: number;
    maxImageSizeBytes: number;
    maxVideoSizeBytes: number;
    maxImageSizeMB: number;
    maxVideoSizeMB: number;
  };
}

export type UploadFileInput =
  | File
  | {
      filename?: string;
      file?: File | Blob;
      buffer?: ArrayBuffer | Uint8Array;
      filePath?: string;
    };

export const PISTORAGE_CONSTRAINTS = {
  MAX_BULK_UPLOAD_AMOUNT: 5,
  MAX_FILE_SIZE_BYTES: 1.5 * 1024 * 1024 * 1024, // 1.5GB
  MAX_FILE_SIZE_GB: 1.5,
  MAX_IMAGE_SIZE_BYTES: 1.5 * 1024 * 1024 * 1024, // 1.5GB
  MAX_VIDEO_SIZE_BYTES: 1.5 * 1024 * 1024 * 1024, // 1.5GB
  MAX_IMAGE_SIZE_MB: 1536,
  MAX_VIDEO_SIZE_MB: 1536,
  UPLOAD_RATE_LIMIT_PER_15_MIN: 500,
  GLOBAL_RATE_LIMIT_PER_15_MIN: 1000,
  AUTH_RATE_LIMIT_PER_15_MIN: 30,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return await blob.arrayBuffer();
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as ArrayBuffer);
      };
      reader.onerror = () => {
        reject(reader.error || new Error('Failed to read blob as ArrayBuffer'));
      };
      reader.readAsArrayBuffer(blob);
    });
  }
  if (typeof Buffer !== 'undefined' && typeof (blob as any).text === 'function') {
    const text = await (blob as any).text();
    const buf = Buffer.from(text);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  throw new Error('Unable to convert Blob to ArrayBuffer in current environment');
}

/**
 * Calculates SHA-256 hash for a given file, Blob, ArrayBuffer, or UploadFileInput.
 * Returns a 64-character lowercase hexadecimal string.
 */
export async function computeSha256(item: UploadFileInput | File | Blob | ArrayBuffer | ArrayBufferView): Promise<string> {
  let arrayBuffer: ArrayBuffer;

  if (item instanceof ArrayBuffer) {
    arrayBuffer = item;
  } else if (ArrayBuffer.isView(item)) {
    const view = item;
    arrayBuffer = view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength
    ) as ArrayBuffer;
  } else if (item instanceof Blob) { // File inherits from Blob
    arrayBuffer = await blobToArrayBuffer(item);
  } else if (item && typeof item === 'object') {
    if ('file' in item && item.file) {
      arrayBuffer = await blobToArrayBuffer(item.file);
    } else if ('buffer' in item && item.buffer) {
      if (item.buffer instanceof ArrayBuffer) {
        arrayBuffer = item.buffer;
      } else if (ArrayBuffer.isView(item.buffer)) {
        const view = item.buffer;
        arrayBuffer = view.buffer.slice(
          view.byteOffset,
          view.byteOffset + view.byteLength
        ) as ArrayBuffer;
      } else {
        throw new Error('Invalid buffer type in UploadFileInput');
      }
    } else {
      throw new Error('Unsupported UploadFileInput structure');
    }
  } else {
    throw new Error('Unsupported item type for computing SHA-256');
  }

  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto?.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toLowerCase();
  } else {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(Buffer.from(arrayBuffer)).digest('hex').toLowerCase();
  }
}

export class PiStorageClient {
  private baseUrl: string;
  private apiKey: string;
  public defaultFolder: string;

  constructor(config?: Partial<PiStorageConfig>) {
    this.baseUrl = (
      config?.baseUrl ||
      process.env.REACT_APP_PISTORAGE_URL ||
      process.env.PISTORAGE_URL ||
      'https://storage.mzecheru.com'
    ).replace(/\/+$/, '');

    this.apiKey =
      config?.apiKey ||
      process.env.REACT_APP_PISTORAGE_API_KEY ||
      process.env.PISTORAGE_API_KEY ||
      '';

    this.defaultFolder =
      config?.defaultFolder ||
      process.env.REACT_APP_PISTORAGE_DEFAULT_FOLDER ||
      process.env.PISTORAGE_DEFAULT_FOLDER ||
      '/journal';

    if (!this.apiKey) {
      console.warn('[PiStorageClient] Warning: PiStorage API key is not configured.');
    }
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.apiKey) {
      h['X-API-Key'] = this.apiKey;
    }
    return h;
  }

  /**
   * Checks whether a given path or folder belongs to the Journal directory.
   */
  isJournalFolder(folderOrPath?: string): boolean {
    if (!folderOrPath) return false;
    const normalized = folderOrPath.startsWith('/') ? folderOrPath.toLowerCase() : `/${folderOrPath.toLowerCase()}`;
    const defaultPrefix = this.defaultFolder.startsWith('/')
      ? this.defaultFolder.toLowerCase()
      : `/${this.defaultFolder.toLowerCase()}`;
    return normalized.startsWith(defaultPrefix) || normalized.startsWith('/journal');
  }

  /**
   * Computes the SHA-256 hex string of a file input.
   */
  async computeFileHash(item: UploadFileInput | File | Blob | ArrayBuffer | Uint8Array): Promise<string> {
    return computeSha256(item);
  }

  /**
   * Bulk checks SHA-256 hashes against PiStorage to detect duplicates before uploading.
   * @param hashes Array of lowercase SHA-256 hex strings
   */
  async checkHashes(hashes: string[]): Promise<CheckHashesResponse> {
    if (!hashes || hashes.length === 0) {
      return { duplicates: {} };
    }

    const res = await fetch(`${this.baseUrl}/api/check-hashes`, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hashes }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[PiStorage Check Hashes Failed] ${res.status}: ${err.error || err.message || res.statusText}`);
    }

    return await res.json();
  }

  /**
   * Constructs the absolute streaming/view URL for an image or video.
   * Ensures auth query param is appended if needed for authenticated access.
   */
  getFileUrl(relativePathOrUrl: string): string {
    if (!relativePathOrUrl) return '';
    let url = relativePathOrUrl;

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (!url.startsWith('/')) url = `/${url}`;
      if (!url.startsWith('/view') && !url.startsWith('/uploads')) {
        url = `/view${url}`;
      }
      url = `${this.baseUrl}${url}`;
    }

    if (this.apiKey && !url.includes('key=') && !url.includes('token=')) {
      url += (url.includes('?') ? '&' : '?') + `key=${encodeURIComponent(this.apiKey)}`;
    }
    return url;
  }

  /**
   * Constructs the absolute URL for streaming a lightweight WebP thumbnail.
   */
  getThumbnailUrl(relativePathOrUrl: string): string {
    if (!relativePathOrUrl) return '';
    let url = relativePathOrUrl;

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (!url.startsWith('/')) url = `/${url}`;
      if (!url.startsWith('/thumb')) {
        url = `/thumb${url}`;
      }
      url = `${this.baseUrl}${url}`;
    }

    if (this.apiKey && !url.includes('key=') && !url.includes('token=')) {
      url += (url.includes('?') ? '&' : '?') + `key=${encodeURIComponent(this.apiKey)}`;
    }
    return url;
  }

  private extractFileInfo(item: UploadFileInput): { name: string; size: number; isVideo: boolean } {
    let name = 'upload.jpg';
    let size = 0;
    let isVideo = false;

    if (item instanceof File) {
      name = item.name;
      size = item.size;
      isVideo = item.type.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv)$/i.test(item.name);
    } else if (item instanceof Blob) {
      name = (item as any).name || 'upload.jpg';
      size = item.size;
      isVideo = item.type.startsWith('video/');
    } else if (item && typeof item === 'object') {
      if ('file' in item && item.file) {
        name = item.filename || (item.file as any).name || 'upload.jpg';
        size = item.file.size;
        isVideo = item.file.type.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv)$/i.test(name);
      } else if ('buffer' in item && item.buffer) {
        name = item.filename || 'upload.jpg';
        size = item.buffer.byteLength || (item.buffer as any).length || 0;
        isVideo = /\.(mp4|mov|webm|avi|mkv)$/i.test(name);
      }
    }

    return { name, size, isVideo };
  }

  /**
   * Uploads one or more files into a target PiStorage folder.
   * Enforces server constraints:
   *  - Pre-validates file sizes against MAX_FILE_SIZE_BYTES (1.5GB)
   *  - Hashes files with SHA-256 and performs pre-flight deduplication against Journal directory
   *  - Automatically chunks non-duplicate files into batches of MAX_BULK_UPLOAD_AMOUNT (5)
   *  - Handles rate limits (HTTP 429) with automatic backoff and retry
   *  - Throttles between chunk uploads to respect rate limits
   */
  async uploadFiles(
    targetFolder: string,
    files: UploadFileInput[],
    onProgress?: (uploadedCount: number, totalCount: number) => void
  ): Promise<UploadResponse> {
    if (!files || files.length === 0) {
      return {
        message: 'No files provided for upload',
        targetFolder,
        uploadedCount: 0,
        failedCount: 0,
        files: [],
        failed: [],
        duplicates: [],
      };
    }

    const cleanFolder = targetFolder.startsWith('/') ? targetFolder : `/${targetFolder}`;
    const validFiles: UploadFileInput[] = [];
    const allFailed: UploadFailedItem[] = [];
    const allUploaded: UploadedMediaItem[] = [];
    const allDuplicates: UploadedMediaItem[] = [];

    // 1. Client-Side Pre-validation for File Size Limits (Up to 1.5GB)
    const maxLimitBytes = PISTORAGE_CONSTRAINTS.MAX_FILE_SIZE_BYTES;
    for (const item of files) {
      const info = this.extractFileInfo(item);

      if (info.size > maxLimitBytes) {
        const sizeGB = (info.size / (1024 * 1024 * 1024)).toFixed(2);
        allFailed.push({
          original_name: info.name,
          original_filename: info.name,
          error: `File exceeds maximum allowed size of 1.5 GB (${sizeGB} GB).`,
        });
      } else {
        validFiles.push(item);
      }
    }

    const totalValid = validFiles.length;
    if (onProgress) {
      onProgress(0, totalValid);
    }

    // 2. Pre-Flight SHA-256 Hashing and Deduplication Check against Journal directory
    const hashedEntries: Array<{
      item: UploadFileInput;
      info: { name: string; size: number; isVideo: boolean };
      hash: string;
    }> = [];
    const uniqueHashesSet = new Set<string>();

    for (const item of validFiles) {
      const info = this.extractFileInfo(item);
      let hash = '';
      try {
        hash = await computeSha256(item);
        if (hash) {
          uniqueHashesSet.add(hash);
        }
      } catch (hashErr) {
        console.warn(`[PiStorageClient] Could not compute hash for ${info.name}:`, hashErr);
      }
      hashedEntries.push({ item, info, hash });
    }

    let duplicateMap: Record<string, PiStorageDuplicateItem> = {};
    if (uniqueHashesSet.size > 0) {
      try {
        const checkRes = await this.checkHashes(Array.from(uniqueHashesSet));
        if (checkRes && checkRes.duplicates) {
          duplicateMap = checkRes.duplicates;
        }
      } catch (checkErr) {
        console.warn('[PiStorageClient] Pre-flight hash check failed, proceeding with direct upload:', checkErr);
      }
    }

    const filesToUpload: UploadFileInput[] = [];

    for (const entry of hashedEntries) {
      const { item, info, hash } = entry;
      const dup = hash ? duplicateMap[hash] : null;

      // Check if duplicate specifically exists in the Journal directory
      if (dup && this.isJournalFolder(dup.folder || dup.relativePath)) {
        const duplicateItem: UploadedMediaItem = {
          id: dup.id,
          original_filename: dup.original_filename || info.name,
          filename: dup.filename,
          file_url: dup.file_url || dup.relativePath,
          thumbnail_url: dup.thumbnail_url || dup.relativePath,
          media_type: info.isVideo ? 'video' : 'image',
          folder: dup.folder,
          was_compressed: 0,
          file_size: info.size,
          sha256: hash,
          is_duplicate: true,
        };
        allUploaded.push(duplicateItem);
        allDuplicates.push(duplicateItem);
      } else {
        filesToUpload.push(item);
      }
    }

    // 3. Batch Chunking into MAX_BULK_UPLOAD_AMOUNT (5) chunks for remaining files
    const chunkSize = PISTORAGE_CONSTRAINTS.MAX_BULK_UPLOAD_AMOUNT;

    for (let i = 0; i < filesToUpload.length; i += chunkSize) {
      const chunk = filesToUpload.slice(i, i + chunkSize);
      const formData = new FormData();
      formData.append('server_path', cleanFolder);

      for (const item of chunk) {
        if (item instanceof File) {
          formData.append('images', item, item.name);
        } else if (item instanceof Blob) {
          formData.append('images', item, (item as any).name || 'upload.jpg');
        } else if (item && typeof item === 'object') {
          if ('file' in item && item.file) {
            formData.append('images', item.file, item.filename || (item.file as any).name || 'upload.jpg');
          } else if ('buffer' in item && item.buffer) {
            const blob = new Blob([item.buffer]);
            formData.append('images', blob, item.filename || 'upload.jpg');
          }
        }
      }

      // 4. Rate-Limit Aware Upload Dispatch with Backoff & Retries
      let attempt = 0;
      const maxRetries = 3;
      let chunkSuccess = false;

      while (attempt < maxRetries && !chunkSuccess) {
        attempt++;
        try {
          const res = await fetch(`${this.baseUrl}/upload`, {
            method: 'POST',
            headers: this.headers,
            body: formData,
          });

          // Handle Rate Limiting (429)
          if (res.status === 429) {
            const retryHeader = res.headers.get('Retry-After');
            const waitSeconds = retryHeader ? Math.max(parseInt(retryHeader, 10), 1) : Math.pow(2, attempt);
            console.warn(
              `[PiStorage Rate Limit] Received HTTP 429. Backing off for ${waitSeconds}s (attempt ${attempt}/${maxRetries})...`
            );
            await sleep(waitSeconds * 1000);
            continue;
          }

          if (!res.ok) {
            const errData = await res.json().catch(() => ({ error: res.statusText }));
            const errMsg = errData.error || errData.message || `Upload failed with HTTP ${res.status}`;
            for (const item of chunk) {
              const info = this.extractFileInfo(item);
              allFailed.push({
                original_name: info.name,
                original_filename: info.name,
                error: errMsg,
              });
            }
            chunkSuccess = true;
            break;
          }

          const data: UploadResponse = await res.json();
          if (data.files && data.files.length) {
            allUploaded.push(...data.files);
          }
          if (data.failed && data.failed.length) {
            allFailed.push(...data.failed);
          }

          chunkSuccess = true;
        } catch (netErr: any) {
          if (attempt >= maxRetries) {
            for (const item of chunk) {
              const info = this.extractFileInfo(item);
              allFailed.push({
                original_name: info.name,
                original_filename: info.name,
                error: netErr.message || 'Network error during upload',
              });
            }
          } else {
            await sleep(1000 * attempt);
          }
        }
      }

      if (onProgress) {
        onProgress(allUploaded.length, totalValid);
      }

      // Small throttle between chunk uploads to respect rate limits
      if (i + chunkSize < filesToUpload.length) {
        await sleep(150);
      }
    }

    if (onProgress) {
      onProgress(allUploaded.length, totalValid);
    }

    return {
      message: `Processed ${files.length} file(s): ${allUploaded.length} ready (${allDuplicates.length} deduplicated), ${allFailed.length} failed`,
      targetFolder: cleanFolder,
      uploadedCount: allUploaded.length,
      failedCount: allFailed.length,
      files: allUploaded,
      failed: allFailed,
      duplicates: allDuplicates,
    };
  }

  /**
   * Generates an expiring signed view URL and Beb short link for private media.
   * @param relativePath relative file path
   * @param expiresInSeconds default 604800 (7 days)
   */
  async getSignedUrl(relativePath: string, expiresInSeconds: number = 604800): Promise<SignedUrlResponse> {
    const res = await fetch(`${this.baseUrl}/api/auth/sign-url`, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: relativePath,
        expiresIn: expiresInSeconds,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[PiStorage Sign-URL Failed] ${res.status}: ${err.error || err.message || res.statusText}`);
    }

    const data = await res.json();
    return {
      ...data,
      fullUrl: data.fullUrl || `${this.baseUrl}${data.signedUrl}`,
    };
  }

  /**
   * Retrieves subdirectories and media items inside a given directory.
   * Gracefully handles non-existent directories by returning empty results.
   */
  async getDirectoryTree(folderPath: string = '/'): Promise<DirectoryTreeResponse> {
    const cleanPath = folderPath.startsWith('/') ? folderPath : `/${folderPath}`;
    const res = await fetch(`${this.baseUrl}/api/tree?path=${encodeURIComponent(cleanPath)}`, {
      method: 'GET',
      headers: this.headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      // If directory does not exist yet, treat it gracefully as empty
      if (res.status === 404 || res.status === 400 || (err.error && err.error.includes('not found'))) {
        return {
          currentPath: cleanPath,
          breadcrumbs: [{ name: 'Root', path: '/' }],
          directories: [],
          files: [],
        };
      }
      throw new Error(`[PiStorage Tree Failed] ${res.status}: ${err.error || err.message || res.statusText}`);
    }

    return await res.json();
  }

  /**
   * Searches media and folders by term.
   */
  async search(query: string) {
    const res = await fetch(`${this.baseUrl}/api/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: this.headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[PiStorage Search Failed] ${res.status}: ${err.error || err.message || res.statusText}`);
    }

    return await res.json();
  }

  /**
   * Creates a directory.
   */
  async createDirectory(folderPath: string) {
    const cleanPath = folderPath.startsWith('/') ? folderPath : `/${folderPath}`;
    const res = await fetch(`${this.baseUrl}/api/dir`, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: cleanPath }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[PiStorage Create Dir Failed] ${res.status}: ${err.error || err.message || res.statusText}`);
    }

    return await res.json();
  }

  /**
   * Deletes a single file and its thumbnail.
   */
  async deleteFile(filePath: string) {
    const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    const res = await fetch(`${this.baseUrl}/api/file`, {
      method: 'DELETE',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: cleanPath }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[PiStorage Delete File Failed] ${res.status}: ${err.error || err.message || res.statusText}`);
    }

    return await res.json();
  }

  /**
   * Deletes a directory and all its contents.
   */
  async deleteDirectory(folderPath: string) {
    const cleanPath = folderPath.startsWith('/') ? folderPath : `/${folderPath}`;
    const res = await fetch(`${this.baseUrl}/api/dir`, {
      method: 'DELETE',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: cleanPath }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[PiStorage Delete Dir Failed] ${res.status}: ${err.error || err.message || res.statusText}`);
    }

    return await res.json();
  }

  /**
   * Moves a single file to a target directory.
   */
  async moveFile(
    sourcePath: string,
    targetFolder: string,
    overwrite: boolean = false
  ): Promise<MoveSingleResponse> {
    const cleanPath = sourcePath.startsWith('/') ? sourcePath : `/${sourcePath}`;
    const cleanFolder = targetFolder.startsWith('/') ? targetFolder : `/${targetFolder}`;

    const res = await fetch(`${this.baseUrl}/api/file/move`, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: cleanPath,
        targetFolder: cleanFolder,
        overwrite,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[PiStorage Move File Failed] ${res.status}: ${err.error || err.message || res.statusText}`);
    }

    return await res.json();
  }

  /**
   * Moves multiple files in batch to a target directory.
   */
  async moveFiles(
    paths: string[],
    targetFolder: string,
    overwrite: boolean = false
  ): Promise<MoveBatchResponse> {
    const cleanPaths = paths.map((p) => (p.startsWith('/') ? p : `/${p}`));
    const cleanFolder = targetFolder.startsWith('/') ? targetFolder : `/${targetFolder}`;

    const res = await fetch(`${this.baseUrl}/api/file/move`, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paths: cleanPaths,
        targetFolder: cleanFolder,
        overwrite,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[PiStorage Move Files Failed] ${res.status}: ${err.error || err.message || res.statusText}`);
    }

    return await res.json();
  }

  /**
   * Helper Endpoint: List Existing Directories in PiStorage.
   */
  async listDirectories(): Promise<ListDirectoriesResponse> {
    const res = await fetch(`${this.baseUrl}/api/dirs`, {
      method: 'GET',
      headers: this.headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[PiStorage List Dirs Failed] ${res.status}: ${err.error || err.message || res.statusText}`);
    }

    return await res.json();
  }
}

// Export singleton instance
export const piStorage = new PiStorageClient();
