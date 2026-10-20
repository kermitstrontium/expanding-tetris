import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const url = process.argv[2];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
let navs = 0; const t0 = Date.now();
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log(`load #${++navs} at ${Date.now() - t0}ms`); });
page.on('requestfinished', (r) => { if (r.url().includes('.ttf')) console.log(`font loaded at ${Date.now() - t0}ms`); });
await page.goto(url, { waitUntil: 'commit' });
for (const ms of [0, 150, 400, 800, 1500, 2500]) {
  await page.waitForTimeout(ms === 0 ? 0 : 150);
  const st = await page.evaluate(() => {
    const s = document.querySelector('#menu .sheet');
    const vis = getComputedStyle(document.body).opacity; return { vis, h: s ? Math.round(s.getBoundingClientRect().height) : null, top: s ? Math.round(s.getBoundingClientRect().top) : null, best: !!document.querySelector('#menu .hiscores'), font: document.fonts?.check?.('12px "Press Start 2P"') };
  }).catch(() => 'navigating');
  console.log(Date.now() - t0, JSON.stringify(st));
}
await page.waitForTimeout(1500);
console.log('total loads', navs);
await b.close();
