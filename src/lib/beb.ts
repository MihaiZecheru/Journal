/**
 * Generates a random hexadecimal ID of the specified length (default 9 digits).
 */
export function generateRandomHexId(length: number = 9): string {
  const chars = '0123456789abcdef';
  let result = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % 16];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * 16)];
    }
  }
  return result;
}

export interface BebShortUrlResponse {
  shortUrl: string;
  alias: string;
}

/**
 * Creates a shortened URL via Journal's server-side proxy (/api/create-short-url).
 * The server securely injects the BEB_USER_ID and contacts Beb server-to-server,
 * completely preventing CORS errors and keeping sensitive credentials out of the client bundle.
 */
export async function createBebShortUrl(
  targetUrl: string,
  customAlias?: string
): Promise<BebShortUrlResponse> {
  const proxyEndpoints = [
    '/api/create-short-url',
    'https://journal.mzecheru.com/api/create-short-url',
  ];

  let lastError: any = null;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const alias = customAlias || generateRandomHexId(9);
    let collisionOccurred = false;

    for (const endpoint of proxyEndpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: targetUrl,
            alias,
            permanent: true,
          }),
        });

        if (!res.ok) {
          // If relative path 404s (e.g. running standalone webpack dev without proxy), try full production domain
          if (res.status === 404 && endpoint === '/api/create-short-url') {
            continue;
          }
          const errData = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(`[Short URL Failed] ${res.status}: ${errData.error || res.statusText}`);
        }

        const data = await res.json();
        if (data.error) {
          // If alias collision, retry with a new alias
          if (typeof data.error === 'string' && data.error.toLowerCase().includes('already in use') && !customAlias) {
            collisionOccurred = true;
            break;
          }
          throw new Error(`[Short URL Failed]: ${data.error}`);
        }

        const shortAlias = data.short_url || alias;
        const fullShortUrl = data.full_short_url || `https://beb.mzecheru.com/${shortAlias}`;
        return {
          shortUrl: fullShortUrl,
          alias: shortAlias,
        };
      } catch (err: any) {
        lastError = err;
        // Try fallback proxy endpoint if relative fails
      }
    }

    if (collisionOccurred) continue;
    if (customAlias) break;
  }

  throw lastError || new Error('Failed to create short URL via server proxy');
}
