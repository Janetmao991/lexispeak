# LexiSpeak — Speaking Studio

Standalone speaking-practice app; sister of LexiAI (~/lexiai). Shares LexiAI's Supabase `words` table:
reads target words, writes back `mastery.speakingPassed` ("Can Speak"). Full spec: `SPEC.md`.

## Stack
Vite + React + TS · Claude (`@anthropic-ai/sdk`, BYOK) for conversation + feedback (`services/claudeService.ts`) ·
Gemini (BYOK) only for audio: transcription, persona voices, pronunciation check (`services/geminiService.ts`) · Supabase.
Code: `App.tsx`, `modes.ts`, `components/`, `services/` (gemini, recorder, words, phrases, history).
macOS wrapper app in `desktop/` (Swift).

## Run
- Dev: `npm run dev` (port 5175)
- Local always-on build: launchd `com.janet.lexispeak-local` serves http://localhost:5182.
  After code changes run `scripts/rebuild-local.sh`. Log: /tmp/lexispeak-local.log (read with `tail`).

## Rules
- Don't change the shared Supabase schema here — schema lives in ~/lexiai/supabase/schema.sql.
- Never print `.env.local`. Don't read `node_modules/`, `dist/`, `desktop/LexiSpeak-arm64`.
- Keep the design language: Playfair serif, cream #FDFBF7, black pill buttons.

## Current status
- Recent: transcription hallucination guard on short clips; Gemini 504 retry.
