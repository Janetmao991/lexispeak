// Gemini — audio only: transcribing your speech, persona voices, and listening for
// pronunciation. Claude can't hear or speak; the conversation itself is in claudeService.ts.
import { GoogleGenAI, Type, Modality, ThinkingLevel, GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { Turn, FeedbackReport } from '../types';
import { IS_DEMO, DemoNoteError } from './demo';
import { speakBrowser, cancelBrowserSpeech } from './browserVoice';

// ---- BYOK: key lives in this browser only (same convention as LexiAI) ----
export const getApiKey = (): string =>
  (typeof localStorage !== 'undefined' && localStorage.getItem('lexiai_api_key')) || process.env.API_KEY || '';
export const hasApiKey = (): boolean => Boolean(getApiKey());

const MODEL = 'gemini-3-flash-preview';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

const getAi = () => {
  if (IS_DEMO) throw new DemoNoteError(); // the demo never calls Gemini
  const key = getApiKey();
  if (!key) throw new Error('No Gemini API key configured. It powers voice (transcription and persona voices) — open Settings and paste your free key from aistudio.google.com/apikey.');
  return new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 60000 } });
};

const TRANSIENT = /503|504|UNAVAILABLE|DEADLINE_EXCEEDED|Deadline expired|overloaded|high demand|fetch failed|network/i;
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

// ---------- Audio: transcription ----------

export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  const response = await generate({
    model: MODEL,
    contents: [{
      parts: [
        { inlineData: { data: base64Audio, mimeType } },
        { text: 'Transcribe this English speech verbatim. Return ONLY the words actually spoken. If the audio is silent, unclear, or contains no speech, return an empty string. NEVER invent, guess, or complete content that is not clearly audible.' },
      ],
    }],
    config: { temperature: 0, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
  });
  return (response.text || '').trim();
};


// ---------- Pronunciation (listens to the learner's real audio clips) ----------

const pronunciationSchema = {
  type: Type.OBJECT,
  properties: {
    pronunciation: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      clipIndex: { type: Type.NUMBER }, word: { type: Type.STRING }, note: { type: Type.STRING },
      ipa: { type: Type.STRING }, heardAs: { type: Type.STRING },
    }, required: ['clipIndex', 'word', 'note', 'ipa'] } },
  },
  required: ['pronunciation'],
};

export const gradePronunciation = async (clips: Turn[]): Promise<FeedbackReport['pronunciation']> => {
  const parts: any[] = [{ text: `You are an expert English pronunciation coach. Attached are ${clips.length} audio clips of a learner's speech (chronological, clipIndex 0-based). What they meant to say, per clip:
${clips.map((c, i) => `[${i}] ${c.text}`).join('\n')}

Listen to the clips. Note specific words that were mispronounced, oddly stressed, or unclear: clipIndex + word + "ipa" = the CORRECT American-English pronunciation in IPA with stress marks (e.g. "/kəˈlæt.ər.əl/") + "heardAs" = how the learner actually said it (IPA or a plain respelling like "col-LAT-er-al", stress in caps) + a short note on the fix. If pronunciation is genuinely clean, return fewer or no notes — don't invent problems.` }];
  for (const clip of clips) {
    parts.push({ inlineData: { data: clip.audioBase64!, mimeType: clip.audioMime || 'audio/webm' } });
  }
  const response = await generate({
    model: MODEL,
    contents: [{ parts }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: pronunciationSchema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      temperature: 0.3,
    },
  });
  return JSON.parse(response.text!).pronunciation || [];
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
  cancelBrowserSpeech();
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

/** Browser-TTS fallback (demo mode, or when Gemini TTS fails). `slot` = persona index → distinct English voice. */
export const speakFallback = (text: string, slot = 0): Promise<void> => speakBrowser(text, slot);

/** TTS with browser fallback so the conversation never blocks on voice. */
export const speakSafe = async (text: string, voiceName: string, slot = 0): Promise<void> => {
  if (IS_DEMO) return speakFallback(text, slot);
  try {
    await speak(text, voiceName);
  } catch {
    await speakFallback(text, slot);
  }
};
