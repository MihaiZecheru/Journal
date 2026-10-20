import supabase from "./config/supabase";

/**
 * Returns HTTP headers including the user's Supabase Bearer token.
 * Throws an error if the user is not authenticated.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error('You must be logged in to perform this action.');
  }

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
}
