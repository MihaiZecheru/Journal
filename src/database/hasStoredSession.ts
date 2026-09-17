import supabase from './config/supabase';

/**
 * Synchronously checks localStorage to determine whether an active Supabase session token exists.
 * This allows components (or routes) to immediately redirect without waiting for async session calls
 * or rendering unwanted unauthenticated UI.
 */
export function hasStoredSession(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }

  try {
    // 1. Check direct storageKey from the initialized supabase client
    const directKey = (supabase as any)?.storageKey;
    if (directKey) {
      const item = window.localStorage.getItem(directKey);
      if (item && item.includes('"access_token"')) {
        return true;
      }
    }

    // 2. Fallback: inspect any key in localStorage matching sb-*-auth-token
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const item = window.localStorage.getItem(key);
        if (item && item.includes('"access_token"')) {
          return true;
        }
      }
    }
  } catch {
    // Gracefully fallback if localStorage is disabled or throws
  }

  return false;
}
