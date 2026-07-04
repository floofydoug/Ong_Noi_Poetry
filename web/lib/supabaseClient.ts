import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Optional: only wired when env vars exist. Until then the app uses on-device
// storage (see lib/suggestions.ts), so it works with no backend.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anon ? createClient(url, anon) : null;

export const hasSupabase = Boolean(supabase);
