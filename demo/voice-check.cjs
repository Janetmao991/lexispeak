// Demo voice check: plays the sample conversations with voices ON and verifies the
// browser speech is clean. Two passes:
//  A. Fake speechSynthesis (deterministic). Its voice list starts with a Chinese
//     default voice, like a Chinese-language Mac, and loads late via voiceschanged.
//     Checks: an English voice is always set explicitly, nothing gets cut off by
//     cancel() during Play, no overlapping speak calls, text is clean and chunked.
//  B. Real Google Chrome (channel 'chrome'): logs the voice actually chosen.
// Also unit-checks pickVoice/cleanForSpeech/splitSentences in Node via esbuild.
// Setup is the same as demo-check.cjs:
//   npm run build && npx vite preview --port 5193 --strictPort
//   (in a scratch dir with playwright) node /path/to/demo/voice-check.cjs
const { chromium } = require('playwright');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = process.env.BASE || 'http://localhost:5193';
const ROOT = path.join(__dirname, '..');
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };

// ---------- Fake speechSynthesis injected before the app loads ----------
const FAKE = () => {
  const mk = (name, lang, isDefault = false) => ({ name, lang, default: isDefault, localService: true, voiceURI: name });
  const ALL = [mk('Tingting', 'zh-CN', true), mk('Albert', 'en-US'), mk('Meijia', 'zh-TW'),
    mk('Daniel', 'en-GB'), mk('Samantha', 'en-US'), mk('Ava (Premium)', 'en-US'), mk('Thomas', 'fr-FR')];
  let loaded = false;
  const listeners = [];
  const log = window.__speech = { speaks: [], cutoffs: 0, overlaps: 0, cancels: 0 };
  let queue = [];   // utterances waiting, like the real engine
  let playing = null; let timer = null;
  const startNext = () => {
    playing = queue.shift() || null;
    if (!playing) return;
    const u = playing;
    u.__started = performance.now();
    timer = setTimeout(() => { playing = null; u.onend && u.onend({}); startNext(); }, 20 + u.text.length * 4);
  };
  const synth = {
    get speaking() { return !!playing; },
    get pending() { return queue.length > 0; },
    paused: false,
    getVoices: () => (loaded ? ALL.slice() : []),
    addEventListener: (t, f) => { if (t === 'voiceschanged') listeners.push(f); },
    removeEventListener: (t, f) => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); },
    speak(u) {
      // Lines are spoken chunk by chunk, each after the previous ends — so a speak()
      // while something is still talking means two lines are piling up.
      if (playing || queue.length) log.overlaps++;
      log.speaks.push({ text: u.text, voice: u.voice ? u.voice.name : null, lang: u.voice ? u.voice.lang : u.lang, pitch: u.pitch, rate: u.rate, t: Math.round(performance.now()) });
      queue.push(u);
      if (!playing) startNext();
    },
    cancel() {
      log.cancels++;
      if (playing) { log.cutoffs++; clearTimeout(timer); const u = playing; playing = null; u.onerror && u.onerror({ error: 'interrupted' }); }
      queue.forEach(u => u.onerror && u.onerror({ error: 'canceled' }));
      queue = [];
    },
    pause() {}, resume() {},
  };
  const Real = window.SpeechSynthesisUtterance;
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.lang = ''; this.voice = null; this.pitch = 1; this.rate = 1; };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  // Mimic Chrome: voices arrive a moment after load.
  setTimeout(() => { loaded = true; listeners.slice().forEach(f => f()); }, 300);
  void Real;
};

const playThrough = async (page, label, total) => {
  // Reset the counters at the start of each sample.
  await page.evaluate(() => { Object.assign(window.__speech, { speaks: [], cutoffs: 0, overlaps: 0, cancels: 0 }); });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByText(`line ${total} of ${total}`).waitFor({ timeout: 120000 });
  await page.waitForTimeout(2500); // let the last line finish
  const s = await page.evaluate(() => window.__speech);
  check(`${label}: lines were spoken`, s.speaks.length > 0, `${s.speaks.length} utterances`);
  check(`${label}: every utterance has an explicit English voice`, s.speaks.every(x => x.voice && /^en/i.test(x.lang)),
    [...new Set(s.speaks.map(x => `${x.voice}/${x.lang}`))].join(', '));
  check(`${label}: picked the best voice (Ava Premium), never the zh default or novelty Albert`, s.speaks.every(x => x.voice === 'Ava (Premium)'));
  check(`${label}: no sentence cut off by cancel() during Play`, s.cutoffs === 0, `${s.cutoffs} cut-offs`);
  check(`${label}: no overlapping speak calls`, s.overlaps === 0, `${s.overlaps}`);
  check(`${label}: no emoji/markdown/brackets spoken`, s.speaks.every(x => !/[\p{Extended_Pictographic}*_#\[\]()<>`]/u.test(x.text)));
  check(`${label}: chunks ≤ 180 chars`, s.speaks.every(x => x.text.length <= 180), `longest ${Math.max(...s.speaks.map(x => x.text.length))}`);
  return s;
};

(async () => {
  // ---------- Unit checks (Node, via esbuild) ----------
  const bundle = execFileSync(path.join(ROOT, 'node_modules/.bin/esbuild'),
    [path.join(ROOT, 'services/browserVoice.ts'), '--bundle', '--format=cjs', '--platform=node'], { encoding: 'utf8' });
  const mk = (name, lang) => ({ name, lang });
  global.window = { speechSynthesis: { getVoices: () => [mk('Tingting', 'zh-CN'), mk('Albert', 'en-US'), mk('Samantha', 'en-US'), mk('Daniel', 'en-GB'), mk('Google US English', 'en-US')], cancel() {} } };
  const mod = { exports: {} };
  const origInfo = console.info; console.info = () => {};
  new Function('module', 'exports', 'require', bundle)(mod, mod.exports, require);
  const bv = mod.exports;
  const p0 = await bv.pickVoice(0), p1 = await bv.pickVoice(1), p0b = await bv.pickVoice(0);
  console.info = origInfo;
  check('unit: persona 0 → Google US English', p0.voice.name === 'Google US English', p0.voice.name);
  check('unit: persona 1 → a different English voice with pitch/rate tweak', p1.voice.name !== p0.voice.name && /^en/.test(p1.voice.lang) && (p1.pitch !== 1 || p1.rate !== 1), `${p1.voice.name} pitch ${p1.pitch} rate ${p1.rate}`);
  check('unit: mapping is stable per persona', p0b.voice.name === p0.voice.name);
  const cleaned = bv.cleanForSpeech('**Great** answer 😄 — honestly (laughs) [pause] see `this` #win');
  check('unit: cleanForSpeech strips markdown/emoji/brackets', cleaned === 'Great answer, honestly see this win', JSON.stringify(cleaned));
  const long = 'One. ' + 'This clause keeps going, '.repeat(12) + 'and ends here! Short? Yes.';
  const parts = bv.splitSentences(long);
  check('unit: splitSentences splits sentences and long clauses', parts[0] === 'One.' && parts.every(x => x.length <= 180) && parts.at(-1) === 'Yes.', `${parts.length} parts`);
  delete global.window;

  const browser = await chromium.launch();
  // ---------- A. Fake speechSynthesis ----------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  const consoleLines = [];
  page.on('console', m => consoleLines.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', e => consoleLines.push(`error: ${e}`));
  await page.goto(`${BASE}/?demo=1`);
  await page.getByRole('button', { name: 'Play Sample' }).first().click();
  await page.getByText('line 1 of 11').waitFor();
  await page.getByRole('button', { name: /Voices off/ }).click();
  await playThrough(page, 'free talk', 11);

  // Pause mid-line must stop speech and stop advancing.
  await page.goto(`${BASE}/?demo=1`);
  await page.locator('div', { hasText: 'Mock interview' }).getByRole('button', { name: 'Play Sample' }).last().click();
  await page.getByText('line 1 of 13').waitFor();
  await page.getByRole('button', { name: /Voices off/ }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => window.__speech.speaks.length > 0, null, { timeout: 15000 });
  await page.getByRole('button', { name: 'Pause' }).click();
  const lineAtPause = await page.getByText(/line \d+ of 13/).textContent();
  await page.waitForTimeout(4000);
  const lineLater = await page.getByText(/line \d+ of 13/).textContent();
  const speaking = await page.evaluate(() => window.speechSynthesis.speaking || window.speechSynthesis.pending);
  check('pause: speech stops and playback stays put', !speaking && lineAtPause === lineLater, `${lineAtPause} → ${lineLater}`);
  // Resume and finish the interview.
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByText('line 13 of 13').waitFor({ timeout: 120000 });
  await page.waitForTimeout(2500);
  const iv = await page.evaluate(() => window.__speech);
  check('interview: every utterance English', iv.speaks.every(x => x.voice && /^en/i.test(x.lang)));
  check('interview: no overlapping speak calls', iv.overlaps === 0, `${iv.overlaps}`);
  const voiceLogs = consoleLines.filter(l => l.includes('[voice]'));
  check('chosen voice is logged once per persona', voiceLogs.length >= 1, voiceLogs.join(' | '));
  check('no console errors (fake pass)', !consoleLines.some(l => l.startsWith('error')), consoleLines.filter(l => l.startsWith('error')).join(' | '));
  // Leaving the session mid-line cancels speech (unmount cleanup).
  await page.goto(`${BASE}/?demo=1`);
  await page.getByRole('button', { name: 'Play Sample' }).first().click();
  await page.getByRole('button', { name: /Voices off/ }).click();
  await page.getByRole('button', { name: 'Next line' }).click();
  await page.waitForTimeout(100);
  await page.getByTitle('Leave session').click();
  await page.waitForTimeout(200);
  check('leaving the session cancels speech', !(await page.evaluate(() => window.speechSynthesis.speaking || window.speechSynthesis.pending)));
  await ctx.close();
  await browser.close();

  // ---------- B. Real Google Chrome ----------
  try {
    const chrome = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const c2 = await chrome.newContext({ serviceWorkers: 'block' });
    const p2 = await c2.newPage();
    const logs = [];
    p2.on('console', m => logs.push(`${m.type()}: ${m.text()}`));
    await p2.goto(`${BASE}/?demo=1`);
    const voices = await p2.evaluate(() => new Promise(r => {
      const read = () => speechSynthesis.getVoices().map(v => `${v.name}|${v.lang}|${v.default ? 'default' : ''}`);
      if (read().length) return r(read());
      speechSynthesis.addEventListener('voiceschanged', () => r(read()));
      setTimeout(() => r(read()), 3000);
    }));
    const def = voices.find(v => v.endsWith('|default'));
    console.log(`real Chrome: ${voices.length} voices, ${voices.filter(v => /\|en/.test(v)).length} English; system default = ${def || 'n/a'}`);
    await p2.getByRole('button', { name: 'Play Sample' }).first().click();
    await p2.getByRole('button', { name: /Voices off/ }).click();
    // Step until a persona (not "You") line has been spoken.
    for (let i = 0; i < 3 && !logs.some(l => l.includes('[voice]')); i++) {
      await p2.getByRole('button', { name: 'Next line' }).click();
      await p2.waitForTimeout(2500);
    }
    const spoke = await p2.evaluate(() => speechSynthesis.speaking || speechSynthesis.pending);
    console.log('real Chrome speaking after step:', spoke);
    const picked = logs.filter(l => l.includes('[voice]'));
    console.log('real Chrome chose:', picked.join(' | ') || '(nothing logged)');
    if (voices.length) check('real Chrome: an English voice was chosen', picked.some(l => /persona 0 → .*\(en/i.test(l)), picked.join(' | '));
    await chrome.close();
  } catch (e) {
    console.log('real Chrome pass skipped:', String(e).split('\n')[0]);
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
