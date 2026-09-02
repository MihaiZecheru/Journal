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

    // Candidates to avoid browser CORS:
    // 1. Same-origin Journal proxy (/api/create-short-url)
    // 2. Direct Beb API (${bebBaseUrl}/api/create)
    const requestCandidates: string[] = [];
    if (typeof window !== 'undefined' && window.location) {
      requestCandidates.push('/api/create-short-url');
    }
    requestCandidates.push(`${bebBaseUrl}/api/create`);

    let collisionOccurred = false;

    for (const endpoint of requestCandidates) {
      try {
        const res = await fetch(endpoint, {
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
          // If proxy returned 404 or 502, try direct Beb endpoint
          if ((res.status === 404 || res.status === 502) && endpoint !== `${bebBaseUrl}/api/create`) {
            continue;
          }
          const errData = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(`[Beb Short URL Failed] ${res.status}: ${errData.error || res.statusText}`);
        }

        const data = await res.json();
        if (data.error) {
          // If alias collision, retry with a new alias
          if (typeof data.error === 'string' && data.error.toLowerCase().includes('already in use') && !customAlias) {
            collisionOccurred = true;
            break;
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
        // Continue to fallback endpoint if available
      }
    }

    if (collisionOccurred) continue;
    if (customAlias) break;
  }

  throw lastError || new Error('Failed to create short URL on Beb');
}
