export type ModeId = 'casual' | 'interview' | 'business' | 'group' | 'free';

export interface Persona {
  name: string;
  voice: string; // Gemini TTS prebuilt voice
  style: string; // personality brief injected into the system prompt
}

export interface ModeDef {
  id: ModeId;
  label: string;
  tagline: string;
  personas: Persona[];
  needsRole?: boolean; // interview mode asks for a target role
}

export interface WordLite {
  word: string;
  definition: string;
  speakingPassed: boolean;
  inRotation: boolean;
}

export interface SessionPlan {
  topic: string;
  opener: { speaker: string; text: string };
  targetWords: string[];
}

export interface Turn {
  speaker: string; // 'You' or persona name
  text: string;
  audioBase64?: string; // user turns only
  audioMime?: string;
  /** Free Talk mode: live corrections for this user turn, shown under the bubble. */
  fixes?: GrammarNote[];
}

export interface GrammarNote {
  quote: string;
  fix: string;
  why: string;
}

export interface PronunciationNote {
  clipIndex: number;
  word: string;
  note: string;
  /** Correct pronunciation in IPA, e.g. "/ˈkɒl.ə.tər.əl/" (added 2026-08-16). */
  ipa?: string;
  /** How the learner actually said it, in IPA or plain respelling — optional. */
  heardAs?: string;
}

export interface IdiomUpgrade {
  original: string;
  upgraded: string;
  /** One-line note on when/why the native phrasing fits (added 2026-08-16). */
  why?: string;
}

/** A saved "Say it like a native" phrase — the Phrase Notebook (added 2026-08-16). */
export interface SavedPhrase {
  id: string;
  original: string;
  upgraded: string;
  why?: string;
  savedAt: number;
  topic?: string;
  mode?: string;
}

export interface TargetWordVerdict {
  word: string;
  used: boolean;
  usedWell: boolean;
  comment: string;
}

export interface FeedbackReport {
  score: number;
  overall: string;
  focusTip: string;
  grammar: GrammarNote[];
  pronunciation: PronunciationNote[];
  idioms: IdiomUpgrade[];
  targetWords: TargetWordVerdict[];
}

export interface SessionRecord {
  id: string;
  mode: ModeId;
  topic: string;
  date: string; // ISO
  userTurns: number;
  report: FeedbackReport;
}
