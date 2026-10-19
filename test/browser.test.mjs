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
  // Keep widening to 34, like a long real game.
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.xt.game.expand(); window.xt.game.drainEvents(); window.xt.renderer.wallAnim = 0; });
  await page.waitForTimeout(300);
  const st3 = await page.evaluate(() => {
    const r = window.xt.renderer, g = window.xt.game;
    return { w: g.width, vis: g.visible, cell: r.cell, left: r.sx(-1), right: r.sx(g.width + 1), top: r.sy(1), bot: r.sy(g.rows + 1), cw: r.w, ch: r.h };
  });
  check(st3.w === 34, `width 34 (got ${st3.w})`);
  check(st3.vis === 68, `field grew taller, keeping 1:2 (${st3.vis} visible rows)`);
  check(st3.left >= 0 && st3.right <= st3.cw + 0.5, 'wide field fits horizontally');
  check(st3.top >= -0.5 && st3.bot <= st3.ch + 0.5 && st3.bot > st3.ch * 0.85, `tall field fills the height (${st3.top.toFixed(0)}..${st3.bot.toFixed(0)} of ${st3.ch.toFixed(0)})`);
  await page.screenshot({ path: 'shots/phone-34.png' });

  // Drags with a controlled clock (headless Chrome can't deliver touch moves
  // fast enough to test speed). Slow: ~22 px per column however tiny the
  // cells. Fast: a quick swipe of the same length goes much further.
  const drag = (x0, x1, ms, steps) => page.evaluate(([x0, x1, ms, steps]) => {
    const inp = window.xt.input, g = window.xt.game;
    g.piece.x = Math.floor(g.width / 2); g.piece.y = 2;
    const start = g.piece.x;
    const real = performance.now;
    let t = real.call(performance);
    performance.now = () => t;
    const ev = (x) => ({ pointerId: 77, clientX: x, clientY: 500, preventDefault() {}, currentTarget: {} });
    inp.down(ev(x0));
    for (let i = 1; i <= steps; i++) { t += ms / steps; inp.move(ev(x0 + (x1 - x0) * i / steps)); }
    inp.up(ev(x1));
    performance.now = real;
    return g.piece.x - start;
  }, [x0, x1, ms, steps]);
  const slow = await drag(80, 190, 1100, 40);
  check(slow >= 4 && slow <= 6, `slow 110px drag moves ~5 columns at width 34 (got ${slow})`);
  const fast = await drag(190, 80, 80, 6);
  check(-fast >= 10, `fast 110px swipe moves further (got ${-fast})`);

  // Touch: tap rotates.
  const rot0 = await page.evaluate(() => { const g = window.xt.game; g.piece = { type: 'T', rot: 0, x: Math.floor(g.width / 2), y: 5 }; return 0; });
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

await run('start-width', { width: 390, height: 844 }, async (page) => {
  check(!(await page.isVisible('#menu .credits')), 'credits hidden until asked for');
  await page.click('[data-act=credits]');
  check(await page.isVisible('#menu .credits'), 'Credits link reveals them');
  check((await page.locator('#menu details').count()) === 0, 'no How to play section');
  await page.click('#menu .chip:text-is("20")');
  await page.screenshot({ path: 'shots/phone-menu.png' });
  await page.click('[data-act=play]');
  await page.waitForTimeout(300);
  const g = await page.evaluate(() => ({ w: window.xt.game.width, v: window.xt.game.visible }));
  check(g.w === 20 && g.v === 40, `start width 20 -> 20 x 40 field (got ${g.w} x ${g.v})`);
  await page.screenshot({ path: 'shots/phone-start20.png' });
});

await run('landscape', { width: 844, height: 390 }, async (page) => {
  await page.click('[data-act=play]');
  await page.waitForTimeout(300);
  // A drag starting over the NEXT panel still moves the piece.
  const box = await page.locator('.next-box').boundingBox();
  const moved = await page.evaluate(([x, y]) => {
    const g = window.xt.game;
    g.piece.x = 2; g.piece.y = 3;
    const el = document.elementFromPoint(x, y);
    const opts = (cx) => ({ bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: y });
    el.dispatchEvent(new PointerEvent('pointerdown', opts(x)));
    for (let i = 1; i <= 10; i++) el.dispatchEvent(new PointerEvent('pointermove', opts(x + i * 6)));
    el.dispatchEvent(new PointerEvent('pointerup', opts(x + 60)));
    return { dx: g.piece.x - 2, on: el.closest('.next-box') ? 'next-box' : el.tagName };
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  check(moved.on === 'next-box' && moved.dx >= 2, `landscape: drag over the ${moved.on} panel moves the piece (${moved.dx} cols)`);
  await page.click('#pauseBtn');
  await page.waitForTimeout(150);
  check(await page.isVisible('#pause'), 'landscape: pause button still works');
  await page.click('[data-act=resume]');
  await page.evaluate(() => { for (let i = 0; i < 12; i++) window.xt.game.expand(); window.xt.renderer.wallAnim = 0; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'shots/landscape-34.png' });
  const v = await page.evaluate(() => window.xt.game.visible);
  check(v === 68, `same rules on every screen: 34 wide -> 68 rows here too (got ${v})`);
});

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
