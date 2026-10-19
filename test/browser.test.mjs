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
  check(await page.evaluate(() => !!window.sprawl.game && !window.sprawl.game.over), 'game starts');
  // Fake three tetrises in a row to widen the field to 16.
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const g = window.sprawl.game;
      const R = g.board.length;
      for (let y = R - 4; y < R; y++) for (let x = 0; x < g.width - 1; x++) g.board[y][x] = 'Z';
      g.piece = { type: 'I', rot: 1, x: g.width - 3, y: 0 };
      g.hardDrop();
    });
    await page.waitForTimeout(900);
  }
  const st = await page.evaluate(() => ({ w: window.sprawl.game.width, cols: window.sprawl.renderer.viewCols, hud: document.querySelector('#width').textContent }));
  check(st.w === 16, `width is 16 after three tetrises (got ${st.w})`);
  check(st.hud === '16', 'HUD shows the width');
  check(st.cols < st.w + 2, `phone viewport (${st.cols} cols) is narrower than the field, so the camera must follow`);
  await page.evaluate(() => { const g = window.sprawl.game; for (let y = g.board.length - 3; y < g.board.length; y++) for (let x = 0; x < g.width; x++) if ((x * 7 + y) % 3) g.board[y][x] = 'JLSTZOI'[(x + y) % 7]; });
  // Move the piece hard left and confirm the camera went with it.
  const camBefore = await page.evaluate(() => window.sprawl.renderer.camX);
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(700);
  const camLeft = await page.evaluate(() => window.sprawl.renderer.camX);
  check(camLeft < camBefore - 0.5, `camera pans left with the piece (${camBefore.toFixed(2)} -> ${camLeft.toFixed(2)})`);
  await page.screenshot({ path: 'shots/phone-wide-left.png' });
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  const camRight = await page.evaluate(() => window.sprawl.renderer.camX);
  check(camRight > camLeft + 2, `camera pans right with the piece (-> ${camRight.toFixed(2)})`);
  await page.screenshot({ path: 'shots/phone-wide-right.png' });
  // Touch: tap rotates.
  const rot0 = await page.evaluate(() => window.sprawl.game.piece?.rot);
  await page.touchscreen.tap(195, 500);
  await page.waitForTimeout(100);
  const rot1 = await page.evaluate(() => window.sprawl.game.piece?.rot);
  check(rot0 !== rot1, 'tap rotates');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(await page.isVisible('#pause'), 'Esc pauses');
  await page.screenshot({ path: 'shots/phone-pause.png' });
});

for (const theme of ['gameboy', 'neon', 'paper']) {
  await run(theme, { width: 390, height: 844 }, async (page) => {
    await page.evaluate((t) => { localStorage.setItem('sprawl.v1', JSON.stringify({ theme: t })); }, theme);
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('[data-act=play]');
    await page.evaluate(() => {
      const g = window.sprawl.game;
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
