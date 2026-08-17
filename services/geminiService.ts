import { GoogleGenAI, Type, Modality, ThinkingLevel, GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { ModeDef, SessionPlan, Turn, FeedbackReport } from '../types';

// ---- BYOK: key lives in this browser only (same convention as LexiAI) ----
export const getApiKey = (): string =>
  (typeof localStorage !== 'undefined' && localStorage.getItem('lexiai_api_key')) || process.env.API_KEY || '';
export const hasApiKey = (): boolean => Boolean(getApiKey());

const MODEL = 'gemini-3-flash-preview';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

const getAi = () => {
  const key = getApiKey();
  if (!key) throw new Error('No Gemini API key configured. Open Settings and paste your free key from aistudio.google.com/apikey.');
  return new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 60000 } });
};

const TRANSIENT = /503|UNAVAILABLE|overloaded|high demand|fetch failed|network/i;
const generate = async (params: GenerateContentParameters, tries = 3): Promise<GenerateContentResponse> => {
  const ai = getAi();
  let lastError: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (e: any) {
      lastError = e;
      if (attempt < tries - 1 && TRANSIENT.test(String(e?.message || ''))) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
};

export const friendlyError = (raw: string): string => {
  if (/503|high demand|overloaded/i.test(raw)) return 'The AI service is briefly overloaded — wait a few seconds and try again.';
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw)) return 'Rate limit reached — take a short break and try again in a minute.';
  if (/API key/i.test(raw)) return raw;
  return 'Something went wrong talking to the AI. Please try again.';
};

// ---------- Session planning ----------

const planSchema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING },
    openerSpeaker: { type: Type.STRING },
    openerText: { type: Type.STRING },
    targetWords: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['topic', 'openerSpeaker', 'openerText', 'targetWords'],
};

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
  }
};

export const planSession = async (mode: ModeDef, candidateWords: string[], role?: string): Promise<SessionPlan> => {
  const response = await generate({
    model: MODEL,
    contents: `You are setting up an English speaking-practice session.

FORMAT: ${modeBrief(mode, role)}
PARTICIPANT PERSONAS: ${mode.personas.map(p => `${p.name} (${p.style})`).join('; ')}

From this learner's vocabulary list, pick 4-6 items that could come up naturally in this session (prefer phrasal verbs, idioms and expressive words; skip stiff written-only terms):
${candidateWords.join(', ')}

Then set a concrete topic that fits the format, and write the opening line spoken by ${mode.personas[0].name} — warm, 1-3 sentences, ending with a question to the learner. Don't use the target words in the opener.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: planSchema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      temperature: 0.9,
    },
  });
  const parsed = JSON.parse(response.text!);
  return {
    topic: parsed.topic,
    opener: { speaker: parsed.openerSpeaker || mode.personas[0].name, text: parsed.openerText },
    targetWords: parsed.targetWords,
  };
};

// ---------- Conversation turns (manual history, JSON replies) ----------

const replySchema = {
  type: Type.OBJECT,
  properties: {
    turns: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { speaker: { type: Type.STRING }, text: { type: Type.STRING } },
        required: ['speaker', 'text'],
      },
    },
  },
  required: ['turns'],
};

export const nextTurns = async (
  mode: ModeDef,
  plan: SessionPlan,
  history: Turn[],
  role?: string,
): Promise<{ speaker: string; text: string }[]> => {
  const transcript = history.map(t => `${t.speaker}: ${t.text}`).join('\n');
  const isGroup = mode.id === 'group';
  const response = await generate({
    model: MODEL,
    contents: `${modeBrief(mode, role)}
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
    config: {
      responseMimeType: 'application/json',
      responseSchema: replySchema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      temperature: 0.9,
    },
  });
  const parsed = JSON.parse(response.text!);
  const valid = new Set(mode.personas.map(p => p.name));
  return (parsed.turns as { speaker: string; text: string }[])
    .filter(t => valid.has(t.speaker))
    .slice(0, isGroup ? 2 : 1);
};

// ---------- Audio: transcription ----------

export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  const response = await generate({
    model: MODEL,
    contents: [{
      parts: [
        { inlineData: { data: base64Audio, mimeType } },
        { text: 'Transcribe this English speech verbatim. Return ONLY the transcribed words. If there is no intelligible speech, return an empty string.' },
      ],
    }],
    config: { temperature: 0, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
  });
  return (response.text || '').trim();
};

// ---------- Feedback (transcript + real audio clips) ----------

const feedbackSchema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.NUMBER },
    overall: { type: Type.STRING },
    focusTip: { type: Type.STRING },
    grammar: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      quote: { type: Type.STRING }, fix: { type: Type.STRING }, why: { type: Type.STRING },
    }, required: ['quote', 'fix', 'why'] } },
    pronunciation: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      clipIndex: { type: Type.NUMBER }, word: { type: Type.STRING }, note: { type: Type.STRING },
      ipa: { type: Type.STRING }, heardAs: { type: Type.STRING },
    }, required: ['clipIndex', 'word', 'note', 'ipa'] } },
    idioms: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      original: { type: Type.STRING }, upgraded: { type: Type.STRING }, why: { type: Type.STRING },
    }, required: ['original', 'upgraded', 'why'] } },
    targetWords: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      word: { type: Type.STRING }, used: { type: Type.BOOLEAN }, usedWell: { type: Type.BOOLEAN }, comment: { type: Type.STRING },
    }, required: ['word', 'used', 'usedWell', 'comment'] } },
  },
  required: ['score', 'overall', 'focusTip', 'grammar', 'pronunciation', 'idioms', 'targetWords'],
};

export const gradeSession = async (
  history: Turn[],
  targetWords: string[],
): Promise<FeedbackReport> => {
  const transcript = history.map(t => `${t.speaker === 'You' ? 'LEARNER' : t.speaker.toUpperCase()}: ${t.text}`).join('\n');
  const clips = history.filter(t => t.speaker === 'You' && t.audioBase64).slice(-6);

  const parts: any[] = [{ text: `You are an expert English speaking coach reviewing a practice session.

TARGET WORDS the learner was practicing: ${targetWords.join(', ')}

TRANSCRIPT:
${transcript}

Attached are up to ${clips.length} audio clips of the LEARNER's actual speech (in chronological order, clipIndex 0-based).

Produce a coaching report:
1. grammar: up to 5 issues — exact quote from the learner, the fix, and a one-line why. Only real errors or clearly unnatural phrasing; skip nitpicks.
2. pronunciation: listen to the audio clips. Note specific words that were mispronounced, oddly stressed, or unclear: clipIndex + word + "ipa" = the CORRECT American-English pronunciation in IPA with stress marks (e.g. "/kəˈlæt.ər.əl/") + "heardAs" = how the learner actually said it (IPA or a plain respelling like "col-LAT-er-al", stress in caps) + a short note on the fix. If pronunciation is genuinely clean, return fewer or no notes — don't invent problems.
3. idioms: up to 4 places where a native speaker would phrase it differently — original vs upgraded, keep the learner's meaning; "why" = one line on the nuance (register, collocation, why natives prefer it).
4. targetWords: for each target word — did the LEARNER use it (any inflection), was it used well, one comment.
5. overall: 2-3 sentences on fluency and communication, encouraging but honest. focusTip: the single highest-leverage thing to work on next. score: /100 for overall spoken performance.` }];

  for (const clip of clips) {
    parts.push({ inlineData: { data: clip.audioBase64!, mimeType: clip.audioMime || 'audio/webm' } });
  }

  const response = await generate({
    model: MODEL,
    contents: [{ parts }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: feedbackSchema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      temperature: 0.3,
    },
  });
  return JSON.parse(response.text!);
};

// ---------- Natural TTS with per-persona voices ----------

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

let activeSpeech: { ctx: AudioContext; source: AudioBufferSourceNode } | null = null;

export const stopSpeech = () => {
  if (activeSpeech) {
    try { activeSpeech.source.stop(); activeSpeech.ctx.close(); } catch { /* already stopped */ }
    activeSpeech = null;
  }
};

/** Fetch TTS audio (base64 PCM) without playing it — lets callers prefetch in parallel. */
export const fetchSpeech = async (text: string, voiceName: string): Promise<string> => {
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text: `Say this warmly and conversationally, like real speech: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  });
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error('No audio returned');
  return base64Audio;
};

/** Play previously fetched TTS audio. */
export const playSpeech = async (base64Audio: string): Promise<void> => {
  stopSpeech();
  const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass({ sampleRate: 24000 });
  const buffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
  return new Promise<void>(resolve => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    activeSpeech = { ctx, source };
    source.onended = () => {
      if (activeSpeech?.source === source) { try { ctx.close(); } catch { /* noop */ } activeSpeech = null; }
      resolve();
    };
    source.start();
  });
};

export const speak = async (text: string, voiceName: string): Promise<void> =>
  playSpeech(await fetchSpeech(text, voiceName));

/** Browser-TTS fallback (used when Gemini TTS fails). */
export const speakFallback = (text: string): Promise<void> => {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise<void>(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
};

/** TTS with browser fallback so the conversation never blocks on voice. */
export const speakSafe = async (text: string, voiceName: string): Promise<void> => {
  try {
    await speak(text, voiceName);
  } catch {
    if ('speechSynthesis' in window) {
      await new Promise<void>(resolve => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      });
    }
  }
};
