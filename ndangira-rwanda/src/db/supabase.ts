import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import type { RawNdangiraJob } from '../types.js';

export function getSupabaseClient() {
  dotenv.config({ path: fileURLToPath(new URL('../../../../app/.env.local', import.meta.url)), override: false });
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
  }

  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function upsertNdangiraJobs(records: RawNdangiraJob[]): Promise<{ count: number; error: any }> {
  if (records.length === 0) return { count: 0, error: null };

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('raw_ndangira_jobs')
    .upsert(records, {
      onConflict: 'external_id',
      ignoreDuplicates: false,
    })
    .select('id');

  if (error) {
    return { count: 0, error };
  }

  return { count: data?.length || records.length, error: null };
}
