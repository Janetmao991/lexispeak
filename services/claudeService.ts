// Conversation + coaching — powered by Claude.
// Audio (transcribing your speech, persona voices, listening for pronunciation) stays on Gemini: geminiService.ts.
import { claudeJson, S } from './claude';
import { gradePronunciation } from './geminiService';
import { ModeDef, Persona, SessionPlan, Turn, FeedbackReport, GrammarNote } from '../types';

export { hasClaudeKey, friendlyError } from './claude';

// ---------- Session planning ----------

const planSchema = S.obj({
  topic: S.str(),
  openerSpeaker: S.str(),
  openerText: S.str(),
  targetWords: S.arr(S.str()),
});

const modeBrief = (mode: ModeDef, role?: string): string => {
  switch (mode.id) {
    case 'casual':
      return 'A relaxed everyday conversation between friends — life, work, culture, plans.';
    case 'interview':
      return `A realistic job interview for the role of: ${role || 'Investment Banking Analyst'}. Mix behavioral and role-specific questions.`;
    case 'business':
      return 'A workplace discussion between colleagues about a concrete business decision with real trade-offs (pricing, hiring, strategy, a deal).';
    case 'group':
      return 'A three-person roundtable (two AI participants + the learner) debating one concrete question with genuinely different viewpoints.';
    case 'free':
      return 'A completely free-form chat — no topic, no agenda; follow wherever the learner wants to go.';
  }
};

export const planSession = async (mode: ModeDef, candidateWords: string[], role?: string): Promise<SessionPlan> => {
  const parsed = await claudeJson<{ topic: string; openerSpeaker: string; openerText: string; targetWords: string[] }>(`You are setting up an English speaking-practice session.

FORMAT: ${modeBrief(mode, role)}
PARTICIPANT PERSONAS: ${mode.personas.map(p => `${p.name} (${p.style})`).join('; ')}

From this learner's vocabulary list, pick 4-6 items that could come up naturally in this session (prefer phrasal verbs, idioms and expressive words; skip stiff written-only terms):
${candidateWords.join(', ')}

Then set a concrete topic that fits the format, and write the opening line spoken by ${mode.personas[0].name} — warm, 1-3 sentences, ending with a question to the learner. Don't use the target words in the opener. Pick a fresh, specific topic each time rather than the most obvious one.`,
    planSchema);
  if (!parsed) throw new Error('No session plan came back — please try again.');
  return {
    topic: parsed.topic,
    opener: { speaker: parsed.openerSpeaker || mode.personas[0].name, text: parsed.openerText },
    targetWords: parsed.targetWords,
  };
};

// ---------- Conversation turns (manual history, JSON replies) ----------

const replySchema = S.obj({
  turns: S.arr(S.obj({ speaker: S.str(), text: S.str() })),
});

export const nextTurns = async (
  mode: ModeDef,
  plan: SessionPlan,
  history: Turn[],
  role?: string,
): Promise<{ speaker: string; text: string }[]> => {
  const transcript = history.map(t => `${t.speaker}: ${t.text}`).join('\n');
  const isGroup = mode.id === 'group';
  const parsed = await claudeJson<{ turns: { speaker: string; text: string }[] }>(`${modeBrief(mode, role)}
TOPIC: ${plan.topic}
PERSONAS you control: ${mode.personas.map(p => `${p.name} — ${p.style}; distinct voice and opinions`).join('; ')}
The learner is "You". Target words the learner should get natural openings to use (never mention this list): ${plan.targetWords.join(', ')}

CONVERSATION SO FAR:
${transcript}

Continue the conversation. Rules:
1. Reply with ${isGroup ? '1-2 turns (one per persona; they may build on or push back at each other, but at most one turn each)' : `exactly 1 turn as ${mode.personas[0].name}`}.
2. Each turn: SHORT spoken language, 1-3 sentences, contractions welcome, no lists or markdown.
3. End the last turn with a question or hook inviting the learner to speak.
4. If the learner misused a word, naturally recast it correctly in passing — never lecture.
5. Steer so target words become natural for the learner to use.${mode.id === 'interview' ? '\n6. Stay in interviewer mode: one question at a time, occasionally probe deeper on the previous answer.' : ''}`,
    replySchema);
  const valid = new Set(mode.personas.map(p => p.name));
  return (parsed?.turns || [])
    .filter(t => valid.has(t.speaker))
    .slice(0, isGroup ? 2 : 1);
};

// ---------- Free Talk: reply + live fixes in one call ----------

const freeReplySchema = S.obj({
  reply: S.str(),
  fixes: S.arr(S.obj({ quote: S.str(), fix: S.str(), why: S.str() })),
});

export const freeTalkTurns = async (
  persona: Persona,
  history: Turn[],
): Promise<{ turns: { speaker: string; text: string }[]; fixes: GrammarNote[] }> => {
  const transcript = history.map(t => `${t.speaker}: ${t.text}`).join('\n');
  const parsed = await claudeJson<{ reply: string; fixes: GrammarNote[] }>(`A completely free-form voice chat between the learner ("You") and ${persona.name} (${persona.style}). No fixed topic — follow wherever the learner takes it.

CONVERSATION SO FAR:
${transcript}

Return:
1. reply — ${persona.name}'s next turn: SHORT spoken language, 1-3 sentences, contractions welcome. React genuinely to what the learner just said, then keep the chat alive (a follow-up question or an invitation to say more — vary it, not every single turn). Never discuss the learner's English mistakes inside the reply; the reply is pure conversation. No lists or markdown — it will be spoken aloud.
2. fixes — corrections for the learner's LAST message only: real grammar errors, wrong word choices, or clearly unnatural phrasing. quote = their exact words, fix = the natural version, why = one short reason. Max 3, most important first. Empty array if the message was fine — never invent problems. Ignore transcription artifacts like punctuation or capitalization.`,
    freeReplySchema);
  if (!parsed) throw new Error('No reply came back — please try again.');
  return { turns: [{ speaker: persona.name, text: parsed.reply }], fixes: parsed.fixes || [] };
};

// ---------- Feedback ----------
// Claude reads the transcript (grammar, idioms, target words, overall);
// Gemini listens to the audio clips for pronunciation. Both run at the same time.

const feedbackSchema = S.obj({
  score: S.num(),
  overall: S.str(),
  focusTip: S.str(),
  grammar: S.arr(S.obj({ quote: S.str(), fix: S.str(), why: S.str() })),
  idioms: S.arr(S.obj({ original: S.str(), upgraded: S.str(), why: S.str() })),
  targetWords: S.arr(S.obj({ word: S.str(), used: S.bool(), usedWell: S.bool(), comment: S.str() })),
});

export const gradeSession = async (
  history: Turn[],
  targetWords: string[],
): Promise<FeedbackReport> => {
  const transcript = history.map(t => `${t.speaker === 'You' ? 'LEARNER' : t.speaker.toUpperCase()}: ${t.text}`).join('\n');
  const clips = history.filter(t => t.speaker === 'You' && t.audioBase64).slice(-6);

  const [report, pronunciation] = await Promise.all([
    claudeJson<Omit<FeedbackReport, 'pronunciation'>>(`You are an expert English speaking coach reviewing a practice session. You see a transcript of what the learner said (made by speech recognition, so ignore punctuation and capitalization).

TARGET WORDS the learner was practicing: ${targetWords.join(', ') || '(none — this was a free conversation; return an empty targetWords array)'}

TRANSCRIPT:
${transcript}

Produce a coaching report:
1. grammar: up to 5 issues — exact quote from the learner, the fix, and a one-line why. Only real errors or clearly unnatural phrasing; skip nitpicks.
2. idioms: up to 4 places where a native speaker would phrase it differently — original vs upgraded, keep the learner's meaning; "why" = one line on the nuance (register, collocation, why natives prefer it).
3. targetWords: for each target word — did the LEARNER use it (any inflection), was it used well, one comment.
4. overall: 2-3 sentences on fluency and communication, encouraging but honest. focusTip: the single highest-leverage thing to work on next. score: /100 for overall spoken performance.`,
      feedbackSchema, { effort: 'medium', timeoutMs: 120000 }),
    // Pronunciation needs ears — a failed or missing Gemini call just leaves this section empty.
    clips.length ? gradePronunciation(clips).catch(e => { console.warn('pronunciation check failed', e); return []; }) : Promise.resolve([]),
  ]);
  if (!report) throw new Error('No feedback came back — please try again.');
  return { ...report, pronunciation } as FeedbackReport;
};
