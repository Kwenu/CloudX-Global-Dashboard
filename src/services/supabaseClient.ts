import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface PublicEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

const env: PublicEnv = (import.meta as unknown as {env?: PublicEnv;}).env ?? {};

export const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').trim();
export const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/** Only the public URL + anon key are ever used in the browser. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured ?
createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) :
null;

export function supabaseHost(): string {
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return '';
  }
}