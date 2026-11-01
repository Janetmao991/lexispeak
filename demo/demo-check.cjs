// Demo-mode walkthrough: fresh browser context, logs every request, screenshots each step.
// Playwright isn't a project dependency — run it from a scratch folder that has it:
//   npm run build && npx vite preview --port 5193 --strictPort
//   (in a scratch dir) npm i playwright && node /path/to/demo/demo-check.cjs /path/to/shots-demo
// BASE=http://host:port overrides the preview URL.
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:5193';
const OUT = process.argv[2];
// AI + database hosts. (fonts.googleapis.com is the web font in index.html, listed separately.)
const FORBIDDEN = /supabase|anthropic|generativelanguage\.googleapis/i;
const NOTE = 'This is a demo — sign up to practice with your own voice.';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const requests = [];
  page.on('request', r => requests.push(r.url()));
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(String(e)));
  const results = [];
  const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
  const shot = async (n, fullPage = false) => { await page.waitForTimeout(600); await page.screenshot({ path: path.join(OUT, n), fullPage }); };
  const visible = async (locator, timeout = 5000) => { try { await locator.first().waitFor({ state: 'visible', timeout }); return true; } catch { return false; } };
  const playToEnd = async (total) => {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    return visible(page.getByText(`line ${total} of ${total}`), 30000);
  };

  // 1. Home
  await page.goto(`${BASE}/?demo=1`);
  check('demo banner shown', await visible(page.getByText('Demo mode', { exact: true })));
  check('no API-key banner', !(await page.getByText('Sessions need a Claude API key').isVisible()));
  check('sample notebook: 8 words, 3 can-speak', await visible(page.getByText('8 words in a sample LexiAI notebook · 3 can-speak')));
  check('word chip: 🗣️ bludgeon', await visible(page.getByText('🗣️ bludgeon')));
  check('all five modes listed', (await page.getByRole('heading', { level: 3 }).allTextContents()).filter(t => /Free Talk|Casual Chat|Interview|Business Talk|Group Discussion/.test(t)).length === 5);
  await shot('01-home.png', true);

  // 2. Unavailable things → friendly note
  await page.getByTitle('Settings').click();
  check('settings → demo note', await visible(page.getByText(NOTE)));
  await page.locator('div', { hasText: 'Casual Chat' }).getByRole('button', { name: 'Start Session' }).first().click();
  check('casual chat → demo note', await visible(page.getByText(NOTE)));
  await shot('02-demo-note.png');

  // 3. Free Talk playback with live fixes
  await page.getByRole('button', { name: 'Play Sample' }).first().click();
  check('free talk: opener + line counter', await visible(page.getByText('line 1 of 11')));
  await page.getByTitle('Speak', { exact: true }).click();
  check('mic → demo note', await visible(page.getByText(NOTE)));
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next line' }).click();
  check('free talk: live grammar fix shown inline', await visible(page.getByText('I just got back')));
  await shot('03-free-talk-fixes.png');
  check('free talk: Play steps to the end', await playToEnd(11));
  check('free talk: later fix shown', await visible(page.getByText('mulling over buying')));
  await shot('04-free-talk-end.png');

  // 4. Free Talk coaching report
  await page.getByRole('button', { name: /End & Get Coaching Report/ }).click();
  check('report: Everything You Said', await visible(page.getByText('Everything You Said'), 8000));
  check('report: score 78', await visible(page.getByText('78', { exact: true })));
  check('report: annotated highlight', (await page.locator('span[role="tooltip"]').count()) >= 5);
  check('report: IPA shown', await visible(page.getByText('/ˈkʌmf.tə.bəl/')));
  await page.getByRole('button', { name: 'Hear it' }).first().click(); // browser speechSynthesis only
  await page.locator('div.border-b', { hasText: 'absolutely packed' }).getByRole('button', { name: 'Save', exact: true }).click();
  check('report: save phrase', await visible(page.locator('div.border-b', { hasText: 'absolutely packed' }).getByRole('button', { name: 'Saved' })));
  await shot('05-free-talk-report.png', true);

  // 5. Interview playback + report with Can Speak
  await page.getByRole('button', { name: 'Home' }).click();
  await page.locator('div', { hasText: 'Mock interview' }).getByRole('button', { name: 'Play Sample' }).last().click();
  check('interview: target word chips', await visible(page.getByText('stretched thin')));
  check('interview: Play steps to the end', await playToEnd(13));
  check('interview: target words crossed off', (await page.locator('span', { hasText: '✓ ' }).count()) === 4);
  await shot('06-interview.png');
  await page.getByRole('button', { name: /End & Get Coaching Report/ }).click();
  check('interview report shown', await visible(page.getByText('Interview · Coaching Report'), 8000));
  const canSpeak = await page.locator('span', { hasText: 'Can Speak' }).count();
  check('interview report: 3 × Can Speak', canSpeak === 3, `found ${canSpeak}`);
  check('interview report: IPA for gauge', await visible(page.getByText('/ɡeɪdʒ/')));
  await shot('07-interview-report.png', true);

  // 6. Home: Can Speak synced to the sample notebook
  await page.getByRole('button', { name: 'Home' }).click();
  check('home: now 6 can-speak', await visible(page.getByText('8 words in a sample LexiAI notebook · 6 can-speak')));
  check('home: 🗣️ stretched thin', await visible(page.getByText('🗣️ stretched thin')));
  await shot('08-home-after.png', true);

  // 7. History + Phrase Notebook
  await page.getByTitle('Session history', { exact: true }).click();
  check('history: 2 seeded + 2 new sessions', (await page.locator('main button').count()) === 4);
  await shot('09-history.png');
  await page.locator('main button').last().click();
  check('history → seeded report opens', await visible(page.getByText('Everything You Said')));
  await page.getByTitle('Phrase notebook', { exact: true }).click();
  check('phrases: 4 seeded + 1 saved', await visible(page.getByText('5 saved')));
  await shot('10-phrases.png', true);

  // 8. Storage: nothing in localStorage, demo data in sessionStorage; survives reload
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage).filter(k => /lexi/i.test(k)),
    session: Object.keys(sessionStorage).filter(k => k.startsWith('lexispeak_demo:')),
  }));
  check('no lexi* localStorage keys', storage.local.length === 0, JSON.stringify(storage.local));
  check('demo data in sessionStorage', storage.session.length >= 3, JSON.stringify(storage.session));
  await page.reload();
  await page.getByTitle('Phrase notebook', { exact: true }).click();
  check('reload keeps demo save', await visible(page.getByText('5 saved')));

  // 9. Exit → sign-in with Try the demo; re-enter
  await page.getByRole('button', { name: 'Exit demo' }).click();
  check('exit lands on Sign In form', await visible(page.getByRole('heading', { name: 'Sign In' })));
  check('sign-in form has Try the demo', await visible(page.getByRole('button', { name: 'Try the demo' })));
  check('exit clears demo session data', (await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('lexispeak_demo:')).length)) === 0);
  await shot('11-exit-signin.png');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  check('Try the demo re-enters', await visible(page.getByText('Demo mode', { exact: true })));
  check('re-entry starts fresh (3 can-speak)', await visible(page.getByText('· 3 can-speak')));

  const hosts = [...new Set(requests.map(u => { try { return new URL(u).host; } catch { return u; } }))];
  const bad = requests.filter(u => FORBIDDEN.test(u));
  check('no Supabase/Anthropic/Gemini requests', bad.length === 0, bad.join(', '));
  console.log('hosts contacted in demo:', hosts.join(', '));
  check('no console errors in demo', consoleErrors.length === 0, consoleErrors.join(' | '));
  await ctx.close();

  // 10. Normal mode is unchanged
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p2 = await ctx2.newPage();
  const req2 = [];
  p2.on('request', r => req2.push(r.url()));
  await p2.goto(`${BASE}/`);
  await p2.waitForTimeout(1500);
  check('normal: no demo banner', !(await p2.getByText('Demo mode', { exact: true }).isVisible()));
  check('normal: Sign In pill + key banner', await p2.getByText('Sessions need a Claude API key').isVisible());
  check('normal: fixture chunk not downloaded', !req2.some(u => /fixture-/.test(u)));
  await p2.getByRole('button', { name: 'Start Talking' }).click();
  check('normal: Start opens Settings (keys needed)', await p2.getByRole('heading', { name: 'Settings' }).isVisible());
  await p2.screenshot({ path: path.join(OUT, '12-normal-mode.png') });
  await ctx2.close();

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
