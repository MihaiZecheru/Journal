import supabase from './config/supabase';

const BASE_URL = 'https://journal.mzecheru.com';

export async function createShareLink(
  type: 'entry' | 'summary',
  title: string,
  content: string
): Promise<string> {
  const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('shared_links')
    .insert([{ type, title, content, expires_at }])
    .select('id')
    .single();

  if (error) throw error;

  return `${BASE_URL}/share/${data.id}`;
}
