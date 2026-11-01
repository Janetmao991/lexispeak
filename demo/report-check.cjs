// Coaching-report highlights check (demo mode): plays the Interview sample, opens the report,
// and verifies red / amber / green marks, the legend, tooltips, and the green dot on overlaps.
// Same setup as demo-check.cjs:  node /path/to/demo/report-check.cjs /path/to/shots-report
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:5193';
const OUT = process.argv[2];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const results = [];
  const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
  const visible = async (loc, timeout = 5000) => { try { await loc.first().waitFor({ state: 'visible', timeout }); return true; } catch { return false; } };

  await page.goto(`${BASE}/?demo=1`);
  await page.locator('div', { hasText: 'Mock interview' }).getByRole('button', { name: 'Play Sample' }).last().click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  check('interview plays to the end', await visible(page.getByText('line 13 of 13'), 30000));
  await page.getByRole('button', { name: /End & Get Coaching Report/ }).click();
  check('report opens', await visible(page.getByText('Everything You Said'), 8000));

  const section = page.locator('section', { hasText: 'Everything You Said' });
  check('legend: red', await visible(section.getByText('— needs fixing')));
  check('legend: amber', await visible(section.getByText(', but a native would say it differently')));
  check('legend: green', await visible(section.getByText(/^Target word\s*used well$/)));
  check('explainer under title', await visible(section.getByText(/Hover or tap any highlight/)));

  const marks = section.locator('span[tabindex="0"]');
  const info = await marks.evaluateAll(els => els.map(e => ({
    text: e.childNodes[0]?.textContent, cls: e.className,
    label: e.querySelector('[role="tooltip"] span')?.textContent, dot: !!e.querySelector('span[aria-hidden]'),
  })));
  const green = info.filter(m => m.cls.includes('3d7a52'));
  console.log('marks:', JSON.stringify(info.map(m => [m.text, m.label, m.dot ? 'dot' : ''])));
  for (const w of ['stretched thin', 'gauge', 'go against the grain'])
    check(`green: "${w}"`, green.some(m => m.text.toLowerCase() === w));
  const mulled = info.find(m => m.text === 'I mulled over it');
  check('overlap: "I mulled over it" stays red with a green dot', !!mulled && mulled.cls.includes('red') && mulled.dot);
  check('red marks: 4', info.filter(m => m.cls.includes('red-50')).length === 4);
  check('amber marks: 3', info.filter(m => m.cls.includes('amber-50')).length === 3);

  // Hover → tooltip with label + sense from the sample notebook.
  const st = marks.filter({ hasText: 'stretched thin' }).first();
  await st.hover();
  const tip = st.locator('[role="tooltip"]');
  check('hover shows green tooltip', await visible(tip, 2000));
  const tipText = await tip.textContent();
  check('tooltip: "Target word · used well" + sense', /Target word · used well/.test(tipText) && /too few resources/.test(tipText), tipText);
  await section.scrollIntoViewIfNeeded();
  await st.hover();
  await page.waitForTimeout(400); // let the fade-in finish
  await section.screenshot({ path: path.join(OUT, '01-transcript-hover-green.png') });

  // Tap/focus (no hover) also opens a tooltip.
  await page.mouse.move(0, 0);
  const mu = marks.filter({ hasText: 'I mulled over it' }).first();
  await mu.focus();
  const muTip = await mu.locator('[role="tooltip"]').textContent();
  check('focus shows overlap tooltip (fix + target note)', await mu.locator('[role="tooltip"]').isVisible() && /mulled it over/.test(muTip) && /Target word/.test(muTip), muTip);
  await page.waitForTimeout(400);
  await section.screenshot({ path: path.join(OUT, '02-transcript-overlap-tooltip.png') });
  await mu.blur();
  await page.waitForTimeout(400);
  await section.screenshot({ path: path.join(OUT, '03-transcript-closeup.png') });
  await page.screenshot({ path: path.join(OUT, '04-full-report.png'), fullPage: true });

  check('no console errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
