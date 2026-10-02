import { createClient } from '@supabase/supabase-js';
import type { RawNdangiraJob } from '../types.js';

export function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required.');
  }

  return createClient(supabaseUrl, supabaseKey);
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
