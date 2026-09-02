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
 * Creates a shortened URL on beb.mzecheru.com pointing to the given image URL.
 * Uses a random 9-digit hexadecimal alias by default.
 */
export async function createBebShortUrl(
  targetUrl: string,
  customAlias?: string
): Promise<BebShortUrlResponse> {
  const bebBaseUrl = (
    process.env.REACT_APP_BEB_URL ||
    process.env.BEB_URL ||
    'https://beb.mzecheru.com'
  ).replace(/\/+$/, '');

  const creatorId =
    process.env.REACT_APP_BEB_USER_ID ||
    process.env.BEB_USER_ID ||
    '2f02d928-5f92-46cf-a2e8-49a3aa8a7bc1';

  let lastError: any = null;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const alias = customAlias || generateRandomHexId(9);

    try {
      const res = await fetch(`${bebBaseUrl}/api/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          creator: creatorId,
          url: targetUrl,
          alias,
          permanent: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(`[Beb Short URL Failed] ${res.status}: ${errData.error || res.statusText}`);
      }

      const data = await res.json();
      if (data.error) {
        // If alias collision, retry with a new alias
        if (typeof data.error === 'string' && data.error.toLowerCase().includes('already in use') && !customAlias) {
          continue;
        }
        throw new Error(`[Beb Short URL Failed]: ${data.error}`);
      }

      const shortAlias = data.short_url || alias;
      return {
        shortUrl: `${bebBaseUrl}/${shortAlias}`,
        alias: shortAlias,
      };
    } catch (err: any) {
      lastError = err;
      if (customAlias) break;
    }
  }

  throw lastError || new Error('Failed to create short URL on Beb');
}
