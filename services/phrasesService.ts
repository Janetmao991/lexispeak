import { SavedPhrase } from '../types';
import { IS_DEMO, demoStore, demoFixture } from './demo';

// Phrase Notebook — "Say it like a native" upgrades the learner chose to keep.
// Local-first (same pattern as historyService); one entry per unique upgraded phrase.
const KEY = 'lexispeak_phrases_v1';
const MAX = 500;

// Demo mode keeps its own copy in this tab's sessionStorage, seeded from the fixture.
const store = IS_DEMO ? demoStore : localStorage;
const read = (): string => store.getItem(KEY) ?? (IS_DEMO ? JSON.stringify(demoFixture().phrases) : '[]');

const norm = (s: string) => s.trim().toLowerCase();

export const phrasesService = {
  getAll: (): SavedPhrase[] => {
    try { return JSON.parse(read()); } catch { return []; }
  },
  has: (upgraded: string): boolean =>
    phrasesService.getAll().some(p => norm(p.upgraded) === norm(upgraded)),
  add: (p: Omit<SavedPhrase, 'id' | 'savedAt'>): SavedPhrase => {
    const all = phrasesService.getAll();
    const existing = all.find(x => norm(x.upgraded) === norm(p.upgraded));
    if (existing) return existing;
    const entry: SavedPhrase = { ...p, id: 'p' + Date.now().toString(36), savedAt: Date.now() };
    store.setItem(KEY, JSON.stringify([entry, ...all].slice(0, MAX)));
    return entry;
  },
  remove: (id: string) => {
    store.setItem(KEY, JSON.stringify(phrasesService.getAll().filter(p => p.id !== id)));
  },
};
