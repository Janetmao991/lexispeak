import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IS_DEMO } from './demo';

// Same Supabase project as LexiAI — one account, one vocabulary.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export const isCloudConfigured = Boolean(supabaseUrl && supabaseKey);

// Demo mode never creates a client: no auth, no reads, no writes.
export const supabase: SupabaseClient | null = isCloudConfigured && !IS_DEMO
  ? createClient(supabaseUrl!, supabaseKey!)
  : null;
