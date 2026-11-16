#!/usr/bin/env node
/**
 * Several screenshots in one browser session (one Chrome launch, so one seeded profile: see chrome.mjs).
 *
 *   node scripts/tour.mjs name=query [name=query ...] [--w 1600] [--h 900] [--wait 1200] [--port 5241]
 *
 * Each `query` is the page's query string without the question mark, for example
 *   dawn=day=4.27&cam=-400,30,-90,0
 * and is written to shots/<name>.png. With no views given, a standard set is taken.
 */
import { launchChrome } from './chrome.mjs';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const opts = { w: '1600', h: '900', wait: '1200', port: '5241' };
const views = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
  else {
    const eq = a.indexOf('=');
    views.push([a.slice(0, eq), a.slice(eq + 1)]);
  }
}
if (views.length === 0) {
  views.push(
    ['bench-dawn', 'day=4.27&sit=1'],
    ['flats-sunrise', 'day=4.262&cam=-420,25,-88,2'],
    ['high-water-noon', 'day=4.5&cam=-150,-70,115,-4'],
    ['night-lamp', 'day=5.92&cam=-330,160,-70,4'],
  );
}

const browser = await launchChrome({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'],
});
const page = await browser.newPage({ viewport: { width: +opts.w, height: +opts.h } });
let failed = false;
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text().slice(0, 1500)}`);
});
page.on('pageerror', (e) => {
  failed = true;
  console.log(`[pageerror] ${e.message}`);
});
mkdirSync(resolve('shots'), { recursive: true });
for (const [name, query] of views) {
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${opts.port}/?${query}`, { waitUntil: 'load', timeout: 90000 });
  try {
    await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 90000, polling: 200 });
  } catch {
    console.log(`[tour] ${name}: never became ready`);
  }
  await page.waitForTimeout(+opts.wait);
  const info = await page.evaluate(() => {
    const e = window.__ebb;
    return e ? { tide: +e.U.uTide.value.toFixed(2), exposure: +e.U.uExposure.value.toFixed(2), hour: +e.clock.hour.toFixed(2), feet: +e.player.y.toFixed(2) } : null;
  });
  const out = resolve('shots', `${name}.png`);
  await page.screenshot({ path: out });
  // frames drawn in one second, as a rough measure of how heavy this view is
  const fps = await page.evaluate(
    () =>
      new Promise((done) => {
        let n = 0;
        const t = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - t < 1000) requestAnimationFrame(tick);
          else done(n);
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(`[tour] ${name}  ${JSON.stringify(info)}  ${fps} fps  ${Date.now() - t0} ms`);
}
await browser.close();
process.exit(failed ? 1 : 0);
