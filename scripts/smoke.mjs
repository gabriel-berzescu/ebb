#!/usr/bin/env node
/**
 * Walks the island with the keyboard and checks that the few things that can be done there can be done:
 * walking, the walls of the house, sitting on the bench, reading the shelf, lighting the far lamp, and sound.
 *
 *   node scripts/smoke.mjs [--port 5241]      (the dev server must be running)
 *
 * Nothing here trusts the wall clock. With the screen asleep a headless browser is handed its frames in bursts, half
 * a second apart, so every check waits for the thing it is checking, and speeds are measured against the time the
 * world was actually stepped through (window.__ebb.stats.sim).
 */
import { launchChrome } from './chrome.mjs';

const port = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '5241';
const browser = await launchChrome({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--autoplay-policy=no-user-gesture-required'],
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
  await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 90000, polling: 100 });
};
/** Wait until `test` (run in the page) is true; false if it never is. */
const until = async (test, arg, timeout = 15000) => {
  try {
    await page.waitForFunction(test, arg, { timeout, polling: 50 });
    return true;
  } catch {
    return false;
  }
};
/** Hold a key while the world is stepped through `seconds`. */
const holdFor = async (key, seconds) => {
  const from = await page.evaluate(() => window.__ebb.stats.sim);
  await page.keyboard.down(key);
  await until(([f, s]) => window.__ebb.stats.sim - f >= s, [from, seconds], 60000);
  await page.keyboard.up(key);
};
/** Hold a key until `test` is true in the page. */
const holdUntil = async (key, test, timeout = 15000) => {
  await page.keyboard.down(key);
  const ok = await until(test, null, timeout);
  await page.keyboard.up(key);
  return ok;
};
const state = () =>
  page.evaluate(() => {
    const e = window.__ebb;
    return {
      x: e.player.x,
      z: e.player.z,
      sim: e.stats.sim,
      seated: e.player.seat !== null,
      lapse: e.clock.lapse,
      farLit: e.lamps.farLit,
      hint: document.getElementById('hint').textContent,
      note: document.getElementById('note').classList.contains('on') ? document.getElementById('note').textContent : '',
      far: { x: e.U.uLampPos.value[1].x, z: e.U.uLampPos.value[1].z },
      tide: e.U.uTide.value,
    };
  });
/** Metres covered per second of stepped time while `keys` are held. */
const speed = async (keys, seconds) => {
  for (const k of keys.slice(0, -1)) await page.keyboard.down(k);
  const a = await state();
  await holdFor(keys[keys.length - 1], seconds);
  const b = await state();
  for (const k of keys.slice(0, -1)) await page.keyboard.up(k);
  return Math.hypot(b.x - a.x, b.z - a.z) / (b.sim - a.sim);
};

// walking and running, from the starting place in front of the bench
await open('day=5.27&run');
const walk = await speed(['w'], 1.2);
check('walking forward moves the walker', walk > 1.4 && walk < 2.1, `${walk.toFixed(2)} m/s`);
const run = await speed(['Shift', 'w'], 1.0);
check('running is faster', run > 3.5 && run < 5.2, `${run.toFixed(2)} m/s`);

// jumping (Silviu asked for it): Space lifts the feet a metre, and hopping along covers ground faster than running
await open('day=5.27&run');
await page.keyboard.down('Space');
const rose = await until(() => {
  const e = window.__ebb;
  window.__top = Math.max(window.__top ?? 0, e.player.y - e.terrain.heightAt(e.player.x, e.player.z));
  return window.__top > 0.8;
}, null, 8000);
await page.keyboard.up('Space');
check('Space jumps', rose, `${(await page.evaluate(() => window.__top)).toFixed(2)} m off the ground`);
check('and the feet come down again', await until(() => !window.__ebb.player.airborne, null, 8000));
const hop = await speed(['Shift', 'Space', 'w'], 2.0);
check('hopping along is faster than running', hop > run * 1.1, `${hop.toFixed(2)} m/s against ${run.toFixed(2)}`);
await until(() => !window.__ebb.player.airborne, null, 8000);

// indoors a jump stops at the rafters
await open('day=5.27&cam=-30.2,13.5,25,0');
await page.keyboard.down('Space');
await until(() => window.__ebb.player.airborne, null, 5000);
await until(() => {
  const e = window.__ebb;
  window.__in = Math.max(window.__in ?? 0, e.player.y - e.terrain.heightAt(e.player.x, e.player.z));
  return !e.player.airborne;
}, null, 8000);
await page.keyboard.up('Space');
const indoor = await page.evaluate(() => window.__in);
check('indoors a jump stops at the rafters', indoor > 0.2 && indoor < 0.8, `${indoor.toFixed(2)} m`);

// the bench: back up to it, sit, and time runs faster; move, and stand again
await open('day=5.27&run');
check('the bench offers a seat', await holdUntil('s', () => document.getElementById('hint').textContent.includes('sit'), 10000), (await state()).hint);
await page.keyboard.press('e');
check('E sits down', await until(() => window.__ebb.player.seat !== null));
const fast = await until(() => window.__ebb.clock.lapse > 5, null, 30000);
check('time runs faster while sitting', fast, `x${(await state()).lapse.toFixed(1)}`);
check('moving stands up again', await holdUntil('w', () => window.__ebb.player.seat === null));

// the north bench: it faces due north and tips the head back, toward the Pole Star
await open('day=20.0&cam=-31.5,5.0,180,0');
check('the north bench offers a seat', await until(() => document.getElementById('hint').textContent.includes('sit')), (await state()).hint);
await page.keyboard.press('e');
await until(() => window.__ebb.player.seat !== null);
const north = await page.evaluate(() => ({ yaw: window.__ebb.player.yaw, pitch: window.__ebb.player.pitch, seated: window.__ebb.player.seat !== null }));
check('sitting there one looks north and up', north.seated && Math.abs(north.yaw) < 0.01 && north.pitch > 0.4, `yaw ${north.yaw.toFixed(2)}, pitch ${north.pitch.toFixed(2)}`);

// the walls of the house keep the walker out: walk at the window wall from in front of it
await open('day=5.27&cam=-33.5,15.6,-65,0');
const w0 = await state();
await holdFor('w', 2.5);
const w1 = await state();
const through = Math.hypot(w1.x - w0.x, w1.z - w0.z);
check('the house wall stops the walker', through < 2.2, `${through.toFixed(2)} m in 2.5 s against the wall`);

// the shelf
await open('day=5.27&cam=-29.6,12.6,-65,0');
check('the shelf can be looked at', await until(() => document.getElementById('hint').textContent.includes('shelf')), (await state()).hint);
await page.keyboard.press('e');
await until(() => document.getElementById('note').classList.contains('on'));
const reading = await state();
check('E shows what was left there', reading.note.includes('feather'), reading.note.slice(0, 40).replace(/\n/g, ' '));

// the far lamp: under water on an ordinary day, clear at the great low
const far = reading.far;
await page.evaluate(() => localStorage.removeItem('ebb.farLamp'));
await open(`day=5.27&cam=${far.x + 1.5},${far.z + 0.5},90,0`);
await until(() => window.__ebb.stats.frames > 10);
const covered = await state();
check('on an ordinary low the far lamp cannot be lit', !covered.hint.includes('lamp') && !covered.farLit, `tide ${covered.tide.toFixed(2)}`);
await open(`day=0.272&cam=${far.x + 1.5},${far.z + 0.5},90,0`);
const offered = await until(() => document.getElementById('hint').textContent.includes('light the lamp'));
const clear = await state();
check('at the great low it offers to be lit', offered, `tide ${clear.tide.toFixed(2)}: ${clear.hint}`);
await page.keyboard.press('e');
check('E lights it', await until(() => window.__ebb.lamps.farLit));
await open('day=5.27');
check('and it stays lit on the next visit', await until(() => window.__ebb.lamps.farLit, null, 5000));
await page.evaluate(() => localStorage.removeItem('ebb.farLamp'));

// sound: after a key press the island can be heard, the jackdaws call before their first flight, and nothing clips
await open('day=5.3&run');
await holdFor('w', 2.5);
check('sound starts with the first key press', await until(() => window.__ebb.sound.running, null, 5000));
check('footsteps are heard when walking', await page.evaluate(() => window.__ebb.sound.steps >= 2), `${await page.evaluate(() => window.__ebb.sound.steps)} steps`);
check('the jackdaws call', await until(() => window.__ebb.sound.calls >= 4, null, 60000), `${await page.evaluate(() => window.__ebb.sound.calls)} calls`);
let peak = 0;
for (let i = 0; i < 40; i++) {
  peak = Math.max(peak, await page.evaluate(() => window.__ebb.sound.level()));
  await page.waitForTimeout(100);
}
check('the sound is neither silent nor clipping', peak > 0.003 && peak < 0.98, `peak ${peak.toFixed(3)}`);

// the sky: the real stars are in it
await open('day=20.0');
const sky = await page.evaluate(() => ({ gain: window.__ebb.U.uStarGain.value, map: !!window.__ebb.U.uStarMap.value }));
check('at night the real stars are shown', sky.gain > 0 && sky.map);

check('no errors on the page', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
