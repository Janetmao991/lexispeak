// Demo mode (?demo=1): a no-sign-up tour for visitors. Everything is served from a bundled
// fixture (demo/fixture.ts) — no Supabase, no Claude, no Gemini, no microphone — and anything
// the visitor changes lives in this tab's sessionStorage only.
//
// The switch is read once from the URL when the page loads. Entering or leaving demo reloads
// the page, which guarantees no Supabase client or API client from the other mode survives.
import type { DemoFixture, DemoScript } from '../demo/fixture';
import type { ModeId, WordLite } from '../types';

export const IS_DEMO = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('demo') === '1';

export const DEMO_NOTE = 'This is a demo — sign up to practice with your own voice.';

/** Thrown by anything the demo can't serve (a safety net — the UI never gets that far). */
export class DemoNoteError extends Error {
  readonly demo = true;
  constructor(message = DEMO_NOTE) {
    super(message);
    this.name = 'DemoNoteError';
  }
}

/** Pop a short toast (rendered by App). */
export const DEMO_NOTE_EVENT = 'lexispeak:demo-note';
export const showDemoNote = (message = DEMO_NOTE) =>
  window.dispatchEvent(new CustomEvent(DEMO_NOTE_EVENT, { detail: message }));

// Key–value storage for the demo: this tab only, namespaced so it can't collide with real keys.
const PREFIX = 'lexispeak_demo:';
export const demoStore = {
  getItem: (key: string): string | null => {
    try { return sessionStorage.getItem(PREFIX + key); } catch { return null; }
  },
  setItem: (key: string, value: string) => {
    try { sessionStorage.setItem(PREFIX + key, value); } catch { /* full or blocked */ }
  },
  removeItem: (key: string) => {
    try { sessionStorage.removeItem(PREFIX + key); } catch { /* noop */ }
  },
  clear: () => {
    try {
      Object.keys(sessionStorage).filter(k => k.startsWith(PREFIX)).forEach(k => sessionStorage.removeItem(k));
    } catch { /* noop */ }
  },
};

export const enterDemo = () => {
  demoStore.clear(); // every visit starts from the same tidy sample data
  window.location.assign(`${window.location.pathname}?demo=1`);
};

/** Leave the demo and land on the sign-in form of the real app. */
export const exitDemo = () => {
  demoStore.clear();
  window.location.assign(`${window.location.pathname}#signin`);
};

// The fixture is loaded with a dynamic import, so normal visitors never download it.
let fixture: DemoFixture | null = null;
export const loadDemoFixture = async () => {
  fixture = (await import('../demo/fixture')).buildDemoFixture();
};
export const demoFixture = (): DemoFixture => {
  if (!fixture) throw new Error('Demo fixture not loaded');
  return fixture;
};

export const demoScript = (mode: ModeId): DemoScript | null =>
  demoFixture().scripts.find(s => s.mode === mode) ?? null;

// The sample LexiAI notebook; "Can Speak" flips are kept for this tab only.
const WORDS_KEY = 'words';
export const getDemoWords = (): WordLite[] => {
  try {
    const saved = demoStore.getItem(WORDS_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* fall through to the fixture */ }
  return demoFixture().words;
};
export const markDemoSpoken = (words: string[]): WordLite[] => {
  const keys = words.map(w => w.toLowerCase());
  const next = getDemoWords().map(w => keys.includes(w.word.toLowerCase()) ? { ...w, speakingPassed: true } : w);
  demoStore.setItem(WORDS_KEY, JSON.stringify(next));
  return next;
};
