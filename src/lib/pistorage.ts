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

export interface UploadResponse {
  message: string;
  targetFolder: string;
  uploadedCount: number;
  failedCount: number;
  files: UploadedMediaItem[];
  failed: UploadFailedItem[];
}

export interface SignedUrlResponse {
  signedUrl: string;
  expiresAt: string;
  expiresInSeconds: number;
  fullUrl: string;
  shortUrl?: string;
  shortUrlAlias?: string;
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
  MAX_IMAGE_SIZE_BYTES: 2 * 1024 * 1024, // 2MB
  MAX_VIDEO_SIZE_BYTES: 20 * 1024 * 1024, // 20MB
  MAX_IMAGE_SIZE_MB: 2,
  MAX_VIDEO_SIZE_MB: 20,
  UPLOAD_RATE_LIMIT_PER_15_MIN: 500,
  GLOBAL_RATE_LIMIT_PER_15_MIN: 1000,
  AUTH_RATE_LIMIT_PER_15_MIN: 30,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
   *  - Pre-validates file sizes against MAX_IMAGE_SIZE_MB (2MB) and MAX_VIDEO_SIZE_MB (20MB)
   *  - Automatically chunks files into batches of MAX_BULK_UPLOAD_AMOUNT (5)
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
      };
    }

    const cleanFolder = targetFolder.startsWith('/') ? targetFolder : `/${targetFolder}`;
    const validFiles: UploadFileInput[] = [];
    const allFailed: UploadFailedItem[] = [];
    const allUploaded: UploadedMediaItem[] = [];

    // 1. Client-Side Pre-validation for File Size Limits
    for (const item of files) {
      const info = this.extractFileInfo(item);
      const limitBytes = info.isVideo
        ? PISTORAGE_CONSTRAINTS.MAX_VIDEO_SIZE_BYTES
        : PISTORAGE_CONSTRAINTS.MAX_IMAGE_SIZE_BYTES;
      const limitMB = info.isVideo
        ? PISTORAGE_CONSTRAINTS.MAX_VIDEO_SIZE_MB
        : PISTORAGE_CONSTRAINTS.MAX_IMAGE_SIZE_MB;

      if (info.size > limitBytes) {
        const sizeMB = (info.size / (1024 * 1024)).toFixed(2);
        allFailed.push({
          original_name: info.name,
          original_filename: info.name,
          error: `File exceeds maximum allowed ${info.isVideo ? 'video' : 'image'} size of ${limitMB} MB (${sizeMB} MB).`,
        });
      } else {
        validFiles.push(item);
      }
    }

    // 2. Batch Chunking into MAX_BULK_UPLOAD_AMOUNT (5) chunks
    const chunkSize = PISTORAGE_CONSTRAINTS.MAX_BULK_UPLOAD_AMOUNT;
    const totalValid = validFiles.length;

    for (let i = 0; i < validFiles.length; i += chunkSize) {
      const chunk = validFiles.slice(i, i + chunkSize);
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

      // 3. Rate-Limit Aware Upload Dispatch with Backoff & Retries
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
      if (i + chunkSize < validFiles.length) {
        await sleep(150);
      }
    }

    return {
      message: `Processed ${files.length} file(s): ${allUploaded.length} uploaded, ${allFailed.length} failed`,
      targetFolder: cleanFolder,
      uploadedCount: allUploaded.length,
      failedCount: allFailed.length,
      files: allUploaded,
      failed: allFailed,
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
}

// Export singleton instance
export const piStorage = new PiStorageClient();
