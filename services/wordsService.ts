import { supabase } from './supabaseClient';
import { WordLite } from '../types';

// Reads the shared LexiAI `words` table and writes mastery back to it.
// Row shape: { user_id, word, data: WordEntry-like jsonb }

export const wordsService = {
  fetchWords: async (userId: string): Promise<WordLite[]> => {
    if (!supabase) return [];
    const out: WordLite[] = [];
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from('words')
        .select('word, data')
        .eq('user_id', userId)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        const d: any = row.data || {};
        out.push({
          word: row.word,
          definition: d.meanings?.[0]?.definitions?.[0]?.definition || '',
          speakingPassed: Boolean(d.mastery?.speakingPassed),
          inRotation: Boolean(d.srs),
        });
      }
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return out;
  },

  /** Flip mastery.speakingPassed on the shared row so LexiAI shows 🗣️ Can Speak. */
  markSpokenWell: async (userId: string, words: string[]): Promise<void> => {
    if (!supabase || words.length === 0) return;
    for (const word of words) {
      const key = word.toLowerCase();
      const { data, error } = await supabase
        .from('words')
        .select('data')
        .eq('user_id', userId)
        .eq('word', key)
        .maybeSingle();
      if (error || !data) continue;
      const merged = {
        ...data.data,
        mastery: { ...(data.data?.mastery || {}), speakingPassed: true },
        lastModified: new Date().toISOString(),
      };
      await supabase.from('words').upsert({
        user_id: userId,
        word: key,
        data: merged,
        updated_at: new Date().toISOString(),
      });
    }
  },
};
