#!/usr/bin/env node
/**
 * Walks the island with the keyboard and checks that the few things that can be done there can be done:
 * walking, the walls of the house, sitting on the bench, reading the shelf, lighting the far lamp.
 *
 *   node scripts/smoke.mjs [--port 5241]      (the dev server must be running)
 */
import { launchChrome } from './chrome.mjs';

const port = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '5241';
const browser = await launchChrome({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300));
});

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};
const open = async (query) => {
  await page.goto(`http://127.0.0.1:${port}/?${query}`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 90000, polling: 200 });
  await page.waitForTimeout(400);
};
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
};
const state = () =>
  page.evaluate(() => {
    const e = window.__ebb;
    return {
      x: e.player.x,
      z: e.player.z,
      y: e.player.y,
      seated: e.player.seat !== null,
      lapse: e.clock.lapse,
      farLit: e.lamps.farLit,
      hint: document.getElementById('hint').textContent,
      note: document.getElementById('note').classList.contains('on') ? document.getElementById('note').textContent : '',
      far: { x: e.U.uLampPos.value[1].x, z: e.U.uLampPos.value[1].z },
      tide: e.U.uTide.value,
    };
  });

// walking, from the starting place in front of the bench
await open('day=5.27&run');
const a = await state();
await hold('w', 1200);
const b = await state();
const walked = Math.hypot(b.x - a.x, b.z - a.z);
check('walking forward moves the walker', walked > 1.2 && walked < 3.5, `${walked.toFixed(2)} m in 1.2 s`);
await hold('Shift', 50);
await page.keyboard.down('Shift');
await hold('w', 1000);
await page.keyboard.up('Shift');
const c = await state();
check('running is faster', Math.hypot(c.x - b.x, c.z - b.z) > 3, `${Math.hypot(c.x - b.x, c.z - b.z).toFixed(2)} m in 1 s`);

// the bench: back up to it, sit, and time runs faster; move, and stand again
await open('day=5.27&run');
await hold('s', 450);
const nearBench = await state();
check('the bench offers a seat', nearBench.hint.includes('sit'), nearBench.hint);
await page.keyboard.press('e');
await page.waitForTimeout(2500);
const sat = await state();
check('E sits down', sat.seated);
check('time runs faster while sitting', sat.lapse > 5, `x${sat.lapse.toFixed(1)}`);
await hold('w', 300);
const stood = await state();
check('moving stands up again', !stood.seated);

// the walls of the house keep the walker out: walk at the window wall from in front of it
await open('day=5.27&cam=-33.5,15.6,-65,0');
const w0 = await state();
await hold('w', 2500);
const w1 = await state();
check('the house wall stops the walker', Math.hypot(w1.x - w0.x, w1.z - w0.z) < 2.2, `${Math.hypot(w1.x - w0.x, w1.z - w0.z).toFixed(2)} m in 2.5 s against the wall`);

// the shelf
await open('day=5.27&cam=-29.6,12.6,-65,0');
const atShelf = await state();
check('the shelf can be looked at', atShelf.hint.includes('shelf'), atShelf.hint);
await page.keyboard.press('e');
await page.waitForTimeout(300);
const reading = await state();
check('E shows what was left there', reading.note.includes('feather'), reading.note.slice(0, 40).replace(/\n/g, ' '));

// the far lamp: under water on an ordinary day, clear at the great low
const far = reading.far;
await page.evaluate(() => localStorage.removeItem('ebb.farLamp'));
await open(`day=5.27&cam=${far.x + 1.5},${far.z + 0.5},90,0`);
const covered = await state();
check('on an ordinary low the far lamp cannot be lit', !covered.hint.includes('lamp') && !covered.farLit, `tide ${covered.tide.toFixed(2)}`);
await open(`day=0.272&cam=${far.x + 1.5},${far.z + 0.5},90,0`);
const clear = await state();
check('at the great low it offers to be lit', clear.hint.includes('light the lamp'), `tide ${clear.tide.toFixed(2)}: ${clear.hint}`);
await page.keyboard.press('e');
await page.waitForTimeout(300);
check('E lights it', (await state()).farLit);
await open('day=5.27');
check('and it stays lit on the next visit', (await state()).farLit);
await page.evaluate(() => localStorage.removeItem('ebb.farLamp'));

// sound: after a key press the island can be heard, the jackdaws call before their first flight, and nothing clips
await open('day=5.3&run');
await hold('w', 1500);
let peak = 0;
for (let i = 0; i < 90; i++) {
  peak = Math.max(peak, await page.evaluate(() => window.__ebb.sound.level()));
  await page.waitForTimeout(100);
}
const heard = await page.evaluate(() => ({ running: window.__ebb.sound.running, calls: window.__ebb.sound.calls, steps: window.__ebb.sound.steps }));
check('sound starts with the first key press', heard.running);
check('footsteps are heard when walking', heard.steps >= 2, `${heard.steps} steps`);
check('the jackdaws call', heard.calls >= 4, `${heard.calls} calls in nine seconds`);
check('the sound is neither silent nor clipping', peak > 0.003 && peak < 0.98, `peak ${peak.toFixed(3)}`);

check('no errors on the page', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
