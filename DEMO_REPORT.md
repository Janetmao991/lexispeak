# Demo mode — report

Branch `demo-mode` (worktree `~/lexispeak-demo`). Committed locally; not pushed.

## What a visitor gets

- **Entry:** `https://lexispeak-seven.vercel.app/?demo=1` (for the portfolio link), or the **Try the
  demo** button at the bottom of the Sign In form.
- **Banner** under the header: `Demo mode · Sample conversations, nothing leaves this tab · Sign up ·
  Exit demo`. Both buttons go back to the normal app with the Sign In form open. LexiSpeak has no
  sign-up form of its own (accounts are made in LexiAI), so *Sign up* lands on Sign In too.
- **Home:** all five modes. **Free Talk** and **Interview** say *Play Sample*. Casual Chat, Business
  Talk and Group Discussion show the demo note when clicked. Below the modes is a **Target words · from
  LexiAI** card with the sample notebook: *bludgeon, mull over, stretched thin, appall, go against the
  grain, gauge, headwind, clip*. Three of them start as 🗣️ Can Speak.
- **Free Talk sample** (a weekend trip to Yosemite with Alex, 11 lines). It plays back like a chat.
  You can step through it with **Next line**, or press **Play** to have it step by itself every 1.5 s
  (press again to pause). Seven **live grammar fixes** show up inline under your lines. Examples:
  *I just come back → I just got back*, *mulling over to buy → mulling over buying*.
- **Interview sample** (Investment Banking Analyst with Morgan, 13 lines). It has 4 target words, and
  each chip gets crossed off as you use the word.
- **Coaching reports:** when the playback ends, *End & Get Coaching Report* opens a full report.
  There is a short "reviewing" pause first. Each report has:
  - a score, an overall note and a Focus Next tip
  - the annotated **Everything You Said** transcript (red = fix this, amber = more native; hover a
    highlight to see the fix)
  - Grammar & Expression
  - Pronunciation with **IPA** plus what you actually said
  - Say It Like a Native, with Save buttons
  - Target Words. In the Interview report, *stretched thin*, *go against the grain* and *gauge* get
    🗣️ Can Speak, and the Home card updates to show 6 can-speak words.
- **Hear it** buttons use the browser's own voice (speechSynthesis), not Gemini. The persona voices
  start **off** in the demo. If a visitor turns them on, the browser voice reads the lines aloud.
- **Session History:** two sample reports are already there (interview 2 days ago, free talk 5 days
  ago), plus any samples the visitor plays.
- **Phrase Notebook:** 4 saved phrases (e.g. *I laid out a clear timeline and looped them both in*,
  *I need to sleep on it*). Saving more and deleting both work.
- **Not available → friendly note** "This is a demo — sign up to practice with your own voice.":
  - the mic button (the note shows above the input)
  - Settings (gear icon) and the three modes without a sample (these show it as a toast)
- **Persistence:** everything the demo changes (saved phrases, history, Can Speak) is kept in this
  tab's `sessionStorage`, under keys prefixed `lexispeak_demo:`. It survives a reload. Exiting or
  re-entering the demo clears it. Nothing goes to `localStorage`, so the visitor's own data and real
  LexiSpeak data are never touched.

## How it works (plain words)

There is one switch, `IS_DEMO`, in `services/demo.ts`. It is read from the URL (`?demo=1`) **once
when the page loads**. Entering or leaving the demo reloads the page, so nothing from the other mode
can stay in memory.

When the switch is on:
- **Supabase is never created** (`supabaseClient.ts` returns `null`). That means no auth calls, no
  reads and no writes.
- **Claude and Gemini are hard-blocked:** the functions that build their clients (in `claude.ts` and
  `geminiService.ts`) throw before making one. The demo never reaches them anyway, because the
  Session plays a script instead of calling the AI. The block is only a safety net.
- **No microphone:** the mic button shows the note and never asks for permission.
- **The fixture is a separate download.** `demo/fixture.ts` is loaded with a dynamic import, so it
  becomes its own ~9.5 KB file. It is also left out of the offline (PWA) precache, so normal visitors
  never download it. The Playwright run checks this.

## Files

New:
- `services/demo.ts`: the switch, the note text and toast event, the session store, enter/exit, the
  fixture loader and the sample-notebook helpers.
- `demo/fixture.ts`: all demo content (words, the two scripts with their reports, history, phrases).
- `demo/demo-check.cjs`: the Playwright walkthrough (its header explains how to run it).

Changed:
- `vite.config.ts`: **separate commit.** `API_KEY` and `ANTHROPIC_API_KEY` are now defined as
  `undefined`, so keys from `.env` are never baked into the bundle. The Supabase ones are kept. A
  later change in the demo commit also adds `globIgnores` for the fixture.
- `index.tsx`: loads the fixture before the first render, in demo mode only.
- `App.tsx`: the banner, the toast, *Try the demo* on Sign In, the `#signin` landing after exit, the
  sample notebook card, *Play Sample* labels, Settings gated, the account pill hidden in demo, and
  Can Speak updates kept in the session.
- `components/Session.tsx`: demo playback (Next line / Play / Pause, line counter), the mic note and
  the pre-written report.
- `components/Feedback.tsx`: in the demo the label says "Can Speak" without "synced to LexiAI".
- `services/supabaseClient.ts`, `claude.ts`, `geminiService.ts`: the blocks described above.
  `speakSafe` goes straight to browser speech in the demo.
- `services/historyService.ts`, `phrasesService.ts`: in the demo they use session storage, seeded
  from the fixture.

## How it was verified

1. `npm run build` (tsc + vite) passes.
2. `grep -r "sk-ant-" dist` → **no matches**. I also checked for Google keys (`AIza…`): none.
3. I ran `vite preview` on port **5193**. Ports 5180, 5182 and 5184 were left alone and are still
   running. I stopped my preview server afterwards.
4. I ran `demo/demo-check.cjs` with Playwright in **fresh browser contexts** (service workers
   blocked), logging every request. **42/42 checks passed**, covering:
   - home: banner, the five modes, the sample notebook
   - the demo note for Settings, Casual Chat and the mic
   - Free Talk: stepping and Play to the end, with inline fixes
   - the Free Talk report: Everything You Said with highlights, IPA, Hear it, saving a phrase
   - the Interview: chips crossed off, the report with 3 × Can Speak, Home now showing 6 can-speak
   - History (4 entries), opening a sample report
   - the Phrase Notebook (5 saved)
   - storage: no `lexi*` localStorage keys, demo data only in sessionStorage, which survives a
     reload
   - Exit → Sign In with *Try the demo*, demo data cleared; *Try the demo* starts fresh
   - **Network:** no requests to Supabase, Anthropic or Gemini (`generativelanguage.googleapis.com`).
     Hosts contacted in demo: `localhost`, `cdn.tailwindcss.com`, and `fonts.googleapis.com` /
     `fonts.gstatic.com`. The last two are just the web fonts linked in `index.html`, not an API.
   - no console errors
   - **Normal mode** (new context, `/`): no banner, the API-key banner and Sign In are back, the
     fixture file is *not* downloaded, and *Start Talking* still opens Settings to ask for keys.
5. Screenshots are in `shots-demo/` (01-home … 12-normal-mode). They are not committed.

## Notes / open questions

- This worktree has no `.env.local`, so the local build's Sign In form says "Cloud is not configured".
  That's expected here. The Vercel build has its env vars and won't show it.
- *Sign up* goes to LexiSpeak's Sign In form, because there is no sign-up form in LexiSpeak. If you'd
  rather it open LexiAI's Create Account form (`lexiai-seven.vercel.app/#signup`, once LexiAI's demo
  branch is live), that's a one-line change in `App.tsx`.
- To ship: merge `demo-mode` into `main` and push. Vercel deploys from `main`.
