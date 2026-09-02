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

  /**
   * Uploads one or more files into a target PiStorage folder.
   */
  async uploadFiles(
    targetFolder: string,
    files: UploadFileInput[]
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

    const formData = new FormData();
    const cleanFolder = targetFolder.startsWith('/') ? targetFolder : `/${targetFolder}`;
    formData.append('server_path', cleanFolder);

    for (const item of files) {
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

    const res = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      headers: this.headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[PiStorage Upload Failed] ${res.status}: ${err.error || err.message || res.statusText}`);
    }

    const data: UploadResponse = await res.json();
    return data;
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
