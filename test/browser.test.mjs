// Headless browser smoke test + screenshots.
//   NODE_PATH=<dir with playwright-core> node test/browser.test.mjs [baseUrl]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const base = process.argv[2] || 'http://127.0.0.1:8095/';
const exe = process.env.CHROME || '/usr/bin/google-chrome-stable';
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++; };

async function run(name, viewport, fn) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(base, { waitUntil: 'networkidle' });
  await fn(page);
  await ctx.close();
}

await run('phone', { width: 390, height: 844 }, async (page) => {
  await page.screenshot({ path: 'shots/phone-menu.png' });
  await page.click('[data-act=play]');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => !!window.xt.game && !window.xt.game.over), 'game starts');
  // Fake three tetrises in a row to widen the field to 16.
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const g = window.xt.game;
      const R = g.board.length;
      for (let y = R - 4; y < R; y++) for (let x = 0; x < g.width - 1; x++) g.board[y][x] = 'Z';
      g.piece = { type: 'I', rot: 1, x: g.width - 3, y: 0 };
      g.hardDrop();
    });
    await page.waitForTimeout(900);
  }
  const cell10 = 390 / 12;
  const st = await page.evaluate(() => {
    const r = window.xt.renderer, g = window.xt.game;
    return { w: g.width, cell: r.cell, left: r.sx(-1), right: r.sx(g.width + 1), cw: r.w, hud: document.querySelector('#width').textContent };
  });
  check(st.w === 16, `width is 16 after three tetrises (got ${st.w})`);
  check(st.hud === '16', 'HUD shows the width');
  check(st.cell < cell10 * 0.8, `view zoomed out (cell ${st.cell}px)`);
  check(st.left >= 0 && st.right <= st.cw + 0.5, `whole field incl. walls on screen (${st.left.toFixed(0)}..${st.right.toFixed(0)} of ${st.cw})`);
  await page.evaluate(() => { const g = window.xt.game; for (let y = g.board.length - 3; y < g.board.length; y++) for (let x = 0; x < g.width; x++) if ((x * 7 + y) % 3) g.board[y][x] = 'JLSTZOI'[(x + y) % 7]; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/phone-wide.png' });
  // Mid-expansion frame, for eyeballing the slide + zoom.
  await page.evaluate(() => {
    const g = window.xt.game, R = g.board.length;
    for (let y = R - 7; y < R - 3; y++) for (let x = 0; x < g.width - 1; x++) g.board[y][x] = 'T';
    g.piece = { type: 'I', rot: 1, x: g.width - 3, y: 0 };
    g.hardDrop();
  });
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'shots/phone-expanding.png' });
  await page.waitForTimeout(800);
  const st2 = await page.evaluate(() => { const r = window.xt.renderer, g = window.xt.game; return { w: g.width, left: r.sx(-1), right: r.sx(g.width + 1), cw: r.w }; });
  check(st2.w === 18 && st2.left >= 0 && st2.right <= st2.cw + 0.5, `still fits after widening to ${st2.w}`);
  // Touch: tap rotates.
  const rot0 = await page.evaluate(() => window.xt.game.piece?.rot);
  await page.touchscreen.tap(195, 500);
  await page.waitForTimeout(100);
  const rot1 = await page.evaluate(() => window.xt.game.piece?.rot);
  check(rot0 !== rot1, 'tap rotates');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(await page.isVisible('#pause'), 'Esc pauses');
  await page.screenshot({ path: 'shots/phone-pause.png' });
});

for (const theme of ['gameboy', 'neon', 'paper']) {
  await run(theme, { width: 390, height: 844 }, async (page) => {
    await page.evaluate((t) => { localStorage.setItem('expanding-tetris.v1', JSON.stringify({ theme: t })); }, theme);
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('[data-act=play]');
    await page.evaluate(() => {
      const g = window.xt.game;
      const R = g.board.length;
      for (let y = R - 6; y < R; y++) for (let x = 0; x < g.width; x++) if ((x * 5 + y) % 4) g.board[y][x] = 'JLSTZOI'[(x + y) % 7];
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `shots/phone-${theme}.png` });
  });
}

await run('desktop', { width: 1280, height: 800 }, async (page) => {
  await page.click('[data-act=play]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/desktop.png' });
});

await browser.close();
for (const e of errors) console.log('console error:', e);
check(errors.length === 0, 'no console errors');
console.log(fails ? `${fails} FAILED` : 'browser: all ok');
process.exit(fails ? 1 : 0);
