# Demo voice fix: report

Spec: `DEMO_VOICE_SPEC.md`. In demo mode (`?demo=1`), the voices sounded messy or garbled.

## Root causes

1. **The Play button cut sentences off.** This was the main cause. Play moved to the next line on a fixed 1.5-second timer, and the next line started with `speechSynthesis.cancel()`. Most persona lines take 3–8 seconds to say, so with voices on, each line was cut off after about 1.5 seconds and the next one started. That sounds like a jumble.
2. **No voice was chosen.** The code set only `u.lang = 'en-US'` and never set `u.voice`, so the browser decided which voice to use. On a Mac set to Chinese, that can be a Chinese system voice reading English, or a low-quality voice. Nothing ever ruled out macOS joke voices like Albert or Bubbles.
3. **Speaking right after cancel().** Chrome sometimes drops or mangles a `speak()` that comes immediately after `cancel()`. The old Next-line code did exactly that every time.
4. **Long utterances.** Chrome can stop partway through a long utterance, and the whole line was sent as one.
5. **Double start in dev.** React StrictMode runs the mount effect twice in development. In normal mode that meant planning the session and speaking the opener twice. This only happens in dev (StrictMode doesn't double-run effects in production builds), so it wasn't the cause on the live demo. It's fixed anyway.
6. **Text not cleaned.** Markdown, emoji and bracketed notes went straight to the speech engine. The demo script happens to be clean today, but replies from the AI may not be.

## Changes

- **New `services/browserVoice.ts`.** All browser speech now goes through this file.
  - `englishVoices()` waits for `voiceschanged` (up to 1.5 s). It keeps only voices whose language starts with `en` and sorts them best first: Premium, Enhanced or Natural voices, then Google US English, then Samantha, Ava, Daniel and similar, with en-US ahead of other English. Joke voices go to the bottom.
  - `pickVoice(slot)`: each persona gets a slot number (its position in the mode's persona list). Each slot always gets the same English voice, and different personas get different ones. Slot 1 and slot 2 are also slightly higher or lower in pitch and faster or slower, so two personas still sound different even if they land on the same voice. The chosen voice is logged once per persona, e.g. `[voice] persona 0 → Samantha (en-US) pitch 1 rate 1`. If no English voice is installed, it logs a warning and falls back to `lang=en-US`.
  - `cleanForSpeech()` removes markdown, code, links, URLs, emoji, and anything in `()[]{}<>`. Dashes become commas.
  - `splitSentences()` splits text into sentences. Any sentence over 180 characters is split again at commas.
  - `speakBrowser(text, slot)` keeps one queue at a time. Starting a new line cancels the old one cleanly (a generation counter stops the old loop), and it waits 80 ms after a cancel before speaking. It keeps a reference to the current utterance, because Chrome loses `onend` if the utterance gets garbage-collected. A timeout per sentence means a missing `onend` can't freeze playback. The returned promise finishes when the line ends or is cancelled.
  - `cancelBrowserSpeech()` stops the current utterance and drops the rest of its queue.
- **`services/geminiService.ts`.** `speakFallback(text, slot)` and the fallback inside `speakSafe` now use `speakBrowser`. `stopSpeech()` also stops browser speech, so every existing stop point covers it: send, mic, finish, unmount, voices off.
- **`components/Session.tsx`.**
  - Play now waits for the current line's speech to finish, then pauses 500 ms before the next line. Silent lines (your own lines, or voices off) still get the 1.5 s reading pause.
  - Next line always speaks with the persona's own voice slot.
  - Pause stops speech immediately. Voices off, leaving the session, and End all stop it through `stopSpeech()`.
  - A ref guard prevents the StrictMode double start.
  - All the scattered `speechSynthesis.cancel()` calls are gone.

## Verification

- `npx tsc --noEmit` and `npm run build` both pass.
- **New `demo/voice-check.cjs`, 19/19 passing.** It has three parts:
  - Node unit checks: persona 0 gets Google US English; persona 1 gets a different English voice (Samantha) with a pitch/rate change; the mapping stays the same across calls; text cleaning works; long text is split correctly.
  - Playwright with a fake speechSynthesis. The fake's voice list starts with Chinese **Tingting as the system default**, plus Albert, Daniel, Samantha, Ava (Premium) and some non-English voices, and the voices load late.
    - Free Talk and Interview played to the end with voices on: 12 utterances in Free Talk, every one with the explicit English voice Ava (Premium).
    - 0 sentences cut off by `cancel()`, 0 overlapping `speak` calls, no emoji, markdown or brackets spoken, longest chunk 66 characters.
    - Pause stops speech and playback stays on the same line. Leaving the session stops speech. No console errors.
  - Real Google Chrome (headless, this Mac: 180 voices, 41 English): Chrome chose `Samantha (en-US)` for persona 0 and was actually speaking. A second persona would get Daniel (en-GB). Joke and low-quality voices (Albert, Bubbles, Eddy, Grandma…) are ranked last.
- `demo/demo-check.cjs`: 42/42 passing. `demo/report-check.cjs`: 16/16 passing.
- Running it: same setup as demo-check. Start `npx vite preview --port 5193 --strictPort`, then run `NODE_PATH=<scratch>/node_modules node demo/voice-check.cjs`.

## Notes

- I couldn't listen to the audio myself. The check confirms which voice was chosen and how lines are queued, not how they sound. Please play a demo with voices on to confirm.
- For better sound: macOS → System Settings → Accessibility → Spoken Content → System voice → Manage Voices, then install **Ava (Premium)** or another **Enhanced/Premium** English voice. The demo picks it up automatically, with no code change.
- Committed on `report-green` and not pushed. `.env` and keys were not touched.
