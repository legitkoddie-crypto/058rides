import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://kvwmejrkdyfjnqwlsdms.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

export const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_ANON_KEY to your .env.local file.");
  }
  return supabase;
}

export const isSupabaseConfigured = Boolean(supabase);
