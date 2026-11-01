// Browser speechSynthesis, done carefully. Used by demo mode and as the fallback
// when Gemini TTS fails. Fixes the "garbled voice" problems:
//  - never trust the system default voice (on a Chinese-language Mac it's a
//    Chinese voice reading English) — always pick an explicit English voice;
//  - one utterance queue at a time: a new line cancels the old queue cleanly;
//  - long lines are split into sentences (Chrome silently stops long utterances);
//  - markdown, emoji and bracketed stage directions are stripped first.

const NOVELTY = /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Deranged|Hysterical|Pipe Organ|Fred|Junior|Kathy|Ralph|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;

const isEnglish = (v: SpeechSynthesisVoice) => /^en([-_]|$)/i.test(v.lang);

/** Higher = better. Natural/premium voices first, en-US over other English, novelty voices last. */
export const scoreVoice = (v: SpeechSynthesisVoice): number => {
  const lang = v.lang.replace('_', '-').toLowerCase();
  let s = lang === 'en-us' ? 30 : lang === 'en-gb' ? 22 : 15;
  if (/premium/i.test(v.name)) s += 40;
  if (/enhanced|natural|neural/i.test(v.name)) s += 35;
  if (/^Google US English$/i.test(v.name)) s += 30;
  if (/^Google UK English/i.test(v.name)) s += 22;
  if (/\b(Samantha|Ava|Allison|Susan|Tom|Alex|Evan|Nathan|Zoe|Joelle|Noelle|Daniel|Karen|Serena|Moira|Tessa)\b/i.test(v.name)) s += 20;
  if (NOVELTY.test(v.name)) s -= 100;
  return s;
};

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/** English voices, best first. Waits for `voiceschanged` (Chrome loads voices async). */
export const englishVoices = (): Promise<SpeechSynthesisVoice[]> => {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  const read = () => window.speechSynthesis.getVoices()
    .filter(isEnglish)
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));
  const now = read();
  if (now.length) return Promise.resolve(now);
  if (!voicesPromise) {
    voicesPromise = new Promise(resolve => {
      const done = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', done);
        clearTimeout(timer);
        const list = read();
        if (!list.length) voicesPromise = null; // try again next time
        resolve(list);
      };
      const timer = setTimeout(done, 1500);
      window.speechSynthesis.addEventListener('voiceschanged', done);
    });
  }
  return voicesPromise;
};

interface VoicePick { voice: SpeechSynthesisVoice | null; pitch: number; rate: number }

const logged = new Set<string>();

/** Persona slot 0, 1, 2… → a distinct English voice with a slight pitch/rate tweak. Stable per slot. */
export const pickVoice = async (slot = 0): Promise<VoicePick> => {
  const voices = await englishVoices();
  // Distinct names only, and skip novelty voices unless nothing else exists.
  const good = voices.filter(v => scoreVoice(v) > 0);
  const pool = (good.length ? good : voices).filter((v, i, a) => a.findIndex(x => x.name === v.name) === i);
  const voice = pool.length ? pool[slot % pool.length] : null;
  // If two personas end up on the same voice, pitch/rate keep them apart.
  const tweaks = [{ pitch: 1, rate: 1 }, { pitch: 0.9, rate: 1.04 }, { pitch: 1.1, rate: 0.97 }];
  const pick = { voice, ...tweaks[slot % tweaks.length] };
  const key = `${slot}:${voice?.name ?? 'none'}`;
  if (!logged.has(key)) {
    logged.add(key);
    if (voice) console.info(`[voice] persona ${slot} → ${voice.name} (${voice.lang}) pitch ${pick.pitch} rate ${pick.rate}`);
    else console.warn('[voice] no English voice installed — using browser default with lang en-US');
  }
  return pick;
};

/** Remove things a TTS engine reads badly: markdown, emoji, (stage directions), [notes], URLs. */
export const cleanForSpeech = (text: string): string => text
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/`([^`]*)`/g, '$1')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')        // [label](url) → label
  .replace(/https?:\/\/\S+/g, ' ')
  .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|<[^>]*>/g, ' ') // brackets and their contents
  .replace(/[*_~#>|]+/g, ' ')
  .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️⃣]/gu, ' ')
  .replace(/\s*[—–]\s*/g, ', ')
  .replace(/\s+/g, ' ')
  .replace(/\s+([,.!?;:])/g, '$1')
  .replace(/^[,\s]+/, '')
  .trim();

const MAX_CHUNK = 180;

/** Sentence chunks short enough that Chrome won't cut them off. */
export const splitSentences = (text: string): string[] => {
  const sentences = text.match(/[^.!?]+(?:[.!?]+["'”’)]*|$)/g)?.map(s => s.trim()).filter(Boolean) ?? [];
  const out: string[] = [];
  for (const s of sentences) {
    if (s.length <= MAX_CHUNK) { out.push(s); continue; }
    let cur = '';
    for (const part of s.split(/(?<=[,;:])\s+/)) {
      if (cur && (cur + ' ' + part).length > MAX_CHUNK) { out.push(cur); cur = part; }
      else cur = cur ? cur + ' ' + part : part;
    }
    if (cur) out.push(cur);
  }
  return out;
};

// Each call to speakBrowser bumps the generation; older queues see the change and stop.
let generation = 0;
// Chrome drops onend if the utterance is garbage-collected mid-speech — keep a reference.
let current: SpeechSynthesisUtterance | null = null;

/** Stop whatever is speaking and abandon its queue. */
export const cancelBrowserSpeech = () => {
  generation++;
  current = null;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
};

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Speak one line, sentence by sentence, with an explicit English voice.
 * Cancels any earlier line first. Resolves when finished or when cancelled.
 */
export const speakBrowser = async (text: string, slot = 0): Promise<void> => {
  if (!('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  const wasBusy = synth.speaking || synth.pending;
  cancelBrowserSpeech();
  const gen = generation;
  const chunks = splitSentences(cleanForSpeech(text));
  if (!chunks.length) return;
  const pick = await pickVoice(slot);
  // Chrome sometimes swallows or garbles a speak() issued right after cancel().
  if (wasBusy) await wait(80);
  for (const chunk of chunks) {
    if (gen !== generation) return;
    await new Promise<void>(resolve => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = pick.voice?.lang || 'en-US';
      if (pick.voice) u.voice = pick.voice;
      u.pitch = pick.pitch;
      u.rate = pick.rate;
      // Safety net: some engines never fire onend. ~15 chars/sec is slow speech.
      const guard = setTimeout(finish, 3000 + chunk.length * 70);
      function finish() { clearTimeout(guard); if (current === u) current = null; resolve(); }
      u.onend = finish;
      u.onerror = finish;
      current = u;
      synth.speak(u);
    });
  }
};
