import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Same Supabase project as LexiAI — one account, one vocabulary.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export const isCloudConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(supabaseUrl!, supabaseKey!)
  : null;
