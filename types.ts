export type ModeId = 'casual' | 'interview' | 'business' | 'group';

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
}

export interface IdiomUpgrade {
  original: string;
  upgraded: string;
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
