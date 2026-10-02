/* src/lib/supabase.ts */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || (typeof process !== 'undefined' && (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL));
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || (typeof process !== 'undefined' && (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY));

// Check configuration status
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

let supabaseClient: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  try {
    supabaseClient = createClient(supabaseUrl!, supabaseAnonKey!);
  } catch (err) {
    console.error("Supabase initialization error:", err);
  }
}

export const supabase = supabaseClient;
