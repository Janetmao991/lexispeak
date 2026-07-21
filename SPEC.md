# LexiSpeak — Speaking Studio

A standalone speaking-practice app that shares LexiAI's vocabulary cloud.
Design language: Playfair serif · cream #FDFBF7 · black pill buttons.

## Why a separate app
Speaking practice deserves an immersive, single-purpose surface (like Writing
Station for writing). LexiAI stays the dictionary/memory workbench; LexiSpeak
is the conversation gym. They meet in the middle: the same Supabase `words`
table is both the source of target words and the destination of mastery
updates (a word spoken well here lights up 🗣️ Can Speak in LexiAI).

## Modes
| Mode | Partner(s) | Voice | Setup |
|---|---|---|---|
| Casual | Alex — warm, curious friend | Puck | topic auto-picked around target words |
| Interview | Morgan — structured, probing interviewer | Charon | user sets target role (default: finance analyst) |
| Business | Sam — sharp colleague who pushes back | Kore | business dilemma auto-generated around target words |
| Group | Alex + Jordan (opposing instincts) + you | Puck + Kore | 3-way discussion; AI decides who speaks each turn |

## Audio-first pipeline (the big upgrade over LexiAI's Conversation)
Every user turn is captured as real audio (MediaRecorder) and transcribed by
Gemini's audio model — no browser speech API. The audio clips are kept for the
session and sent to the AI at feedback time, so pronunciation feedback is
based on what you actually sounded like, not a lossy transcript.

## Feedback report
1. Grammar & expression: quote → fix → why (from transcript)
2. Pronunciation notes: per-clip, word-level observations (from audio)
3. Say it like a native: idiomatic upgrades of your phrasings
4. Target words: used well / missed, with comments
5. Score /100 + one focus tip. Reports saved locally (History).

## Vocabulary loop
- On login, pull words from the shared Supabase `words` table (RLS: own rows).
- Each session: AI picks 4-6 speaking-worthy words as targets (prefer words in
  SRS rotation that aren't yet Can Speak).
- After feedback: words judged "used well" get `mastery.speakingPassed = true`
  written back to the shared table.

## Stack
Vite + React + TS · Tailwind CDN · @google/genai (BYOK, key in localStorage)
· @supabase/supabase-js (same project as LexiAI) · port 5175.
