import * as THREE from 'three';
import shelfData from '../shelf.json';
import { Interactions } from './game/interact';
import { Player, type Controls } from './game/player';
import { Sound, type Surface } from './game/sound';
import { Jackdaws } from './render/jackdaws';
import { Lamps } from './render/lamps';
import { FAR, resetExposure, U, updateShared } from './render/shared';
import { Shadows } from './render/shadow';
import { Sky } from './render/sky';
import { starMapTexture } from './render/starMap';
import { buildStructures, type ShelfItem } from './render/structures';
import { groundTexture, terrainMesh } from './render/terrainMesh';
import { poolsMesh, seaMesh } from './render/water';
import { DAY } from './world/constants';
import { Clock } from './world/clock';
import { distanceToCauseway, HOUSE, housePoint, STONES } from './world/layout';
import { buildTerrain } from './world/terrain';

declare global {
  interface Window {
    __READY__?: boolean;
    __ebb?: unknown;
  }
}

const params = new URLSearchParams(location.search);
const num = (k: string): number | undefined => (params.has(k) && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : undefined);

const canvas = document.getElementById('world') as HTMLCanvasElement;
const titleEl = document.getElementById('title') as HTMLElement;
const loadingEl = document.getElementById('loading') as HTMLElement;
const hintEl = document.getElementById('hint') as HTMLElement;
const noteEl = document.getElementById('note') as HTMLElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.autoClear = true;
renderer.setClearColor(0x000000, 1);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.08, FAR);
camera.rotation.order = 'YXZ';
const scene = new THREE.Scene();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---- the world ---------------------------------------------------------------------------------------------------

const terrain = buildTerrain();
U.uGround.value = groundTexture(terrain);
U.uGroundSize.value = terrain.size;
U.uStarMap.value = starMapTexture();

const sky = new Sky();
scene.add(sky.dome);
scene.add(terrainMesh(terrain));
scene.add(seaMesh());
scene.add(poolsMesh(terrain));

const shelf = shelfData as ShelfItem[];
const built = buildStructures(terrain, shelf);
scene.add(built.mesh);
const solids = built.solids;
const lamps = new Lamps();
scene.add(lamps.group);
const shadows = new Shadows(built.mesh.geometry);
const jackdaws = new Jackdaws(terrain);
scene.add(jackdaws.group);
const sound = new Sound();
jackdaws.onCall = (x, y, z, pitch, delay) => sound.jackdaw(x, y, z, pitch, delay);

// ---- time --------------------------------------------------------------------------------------------------------

const fixedDay = num('day');
const clock = new Clock(fixedDay !== undefined ? fixedDay * DAY : undefined);
if (params.has('run')) clock.running = true;
const lapseParam = num('lapse');
if (lapseParam !== undefined) clock.lapse = lapseParam;
window.addEventListener('beforeunload', () => clock.save());
setInterval(() => clock.save(), 5000);

// ---- the walker --------------------------------------------------------------------------------------------------

const player = new Player(terrain, solids);
{
  // begin outside the house, in front of the bench, looking out over the flats
  const [sx, , sz] = housePoint(-1.7, HOUSE.depth / 2 + 2.4);
  player.place(sx, sz, Player.yawToward(HOUSE.front[0], HOUSE.front[1]), -0.06);
  // ?stone=9 stands in front of the ninth standing stone, facing its carved side
  const stone = num('stone');
  if (stone !== undefined && STONES[stone - 1]) player.place(STONES[stone - 1].x + 3.2, STONES[stone - 1].z + 0.15, Math.PI / 2, 0);
  const cam = params.get('cam');
  if (cam) {
    const [x, z, yawDeg, pitchDeg] = cam.split(',').map(Number);
    player.place(x, z, ((yawDeg ?? 0) * Math.PI) / 180, ((pitchDeg ?? 0) * Math.PI) / 180);
  }
}

const interactions = new Interactions(player, clock, lamps, shelf, hintEl, noteEl);
interactions.onLit = () => sound.lampLit();
if (params.has('lit')) lamps.farLit = params.get('lit') !== '0';
if (params.has('sit')) interactions.sit();

const keys = new Set<string>();
let lookX = 0;
let lookY = 0;
let act = false;
let padActWas = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !e.repeat) act = true;
  if (e.code === 'KeyM' && !e.repeat) sound.toggleMute();
  sound.start();
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
canvas.addEventListener('click', () => {
  sound.start();
  if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) titleEl.classList.add('gone');
});
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  lookX += e.movementX * 0.0022;
  lookY += e.movementY * 0.0022;
});

function readControls(dt: number): Controls {
  let moveX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let moveZ = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  let run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const pad = navigator.getGamepads?.().find((g) => g && g.connected);
  if (pad) {
    const dead = (v: number) => (Math.abs(v) < 0.14 ? 0 : v);
    moveX += dead(pad.axes[0] ?? 0);
    moveZ -= dead(pad.axes[1] ?? 0);
    lookX += dead(pad.axes[2] ?? 0) * dt * 2.4;
    lookY += dead(pad.axes[3] ?? 0) * dt * 1.8;
    run = run || (pad.buttons[7]?.value ?? 0) > 0.3 || !!pad.buttons[10]?.pressed;
    if (pad.buttons.some((b) => b.pressed)) {
      titleEl.classList.add('gone');
      sound.start();
    }
    const padAct = !!pad.buttons[0]?.pressed;
    if (padAct && !padActWas) act = true;
    padActWas = padAct;
  }
  const c: Controls = { moveX, moveZ, run, lookX, lookY };
  lookX = 0;
  lookY = 0;
  return c;
}

// ---- the loop ----------------------------------------------------------------------------------------------------

let last = performance.now();
let frames = 0;
let realTime = 0;
let lastX = player.x;
let lastZ = player.z;
let toWater = 200;
let waterCheck = 0;
let stir = 0;
/** Seconds the world has actually been stepped through, and frames drawn (for the checks: frames can come unevenly). */
const stats = { sim: 0, frames: 0 };

/** Metres from a point to the nearest water, sea or pool (0 when standing in it, 200 when there is none near). */
function distanceToWater(x: number, z: number, tide: number): number {
  if (terrain.waterAt(x, z, tide) > -Infinity) return 0;
  for (const r of [2, 4, 7, 12, 20, 35, 60, 100, 160]) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + r;
      if (terrain.waterAt(x + Math.cos(a) * r, z + Math.sin(a) * r, tide) > -Infinity) return r;
    }
  }
  return 200;
}

function frame(now: number): void {
  // (the first frame can carry a time from before the island finished building: never step backwards)
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  realTime += dt;
  stats.sim += dt;
  stats.frames++;
  clock.advance(dt);

  const state = updateShared(clock.t, realTime, dt);
  const controls = readControls(dt);
  interactions.update(dt, state.tide, act, Math.hypot(controls.moveX, controls.moveZ) > 0.3, controls.run);
  act = false;
  player.update(dt, controls, state.tide);
  lamps.update(realTime, state.tide);
  jackdaws.update(dt, state.heavens.sunDir[1], state.tide);
  const eye = player.eye();

  // what is underfoot, how near the water is, and whether the walker is stirring it
  const feetGround = terrain.heightAt(player.x, player.z);
  const depthHere = Math.max(0, terrain.waterAt(player.x, player.z, state.tide) - feetGround);
  const moved = Math.hypot(player.x - lastX, player.z - lastZ);
  const walked = interactions.sitting || moved > 1 ? 0 : moved;
  lastX = player.x;
  lastZ = player.z;
  waterCheck -= dt;
  if (waterCheck <= 0) {
    waterCheck = 0.3;
    toWater = distanceToWater(player.x, player.z, state.tide);
  }
  const hx = player.x - HOUSE.x;
  const hz = player.z - HOUSE.z;
  const indoors =
    Math.abs(hx * HOUSE.side[0] + hz * HOUSE.side[1]) < HOUSE.width / 2 - HOUSE.thick && Math.abs(hx * HOUSE.front[0] + hz * HOUSE.front[1]) < HOUSE.depth / 2 - HOUSE.thick;
  const surface: Surface =
    depthHere > 0.04
      ? 'water'
      : indoors || player.y > feetGround + 0.08 || distanceToCauseway(player.x, player.z) < 2.4
        ? 'stone'
        : feetGround > 8.4
          ? 'grass'
          : feetGround > 3.4
            ? 'shingle'
            : 'sand';
  sound.update(dt, {
    x: eye.x,
    y: eye.y,
    z: eye.z,
    faceX: -Math.sin(player.yaw),
    faceZ: -Math.cos(player.yaw),
    toWater,
    walked,
    running: controls.run,
    surface,
    indoors,
    swimming: player.swimming,
    night: state.night,
  });
  const stirring = (depthHere > 0.03 && walked > 0) || params.has('stir') ? 1 : 0;
  stir += (stirring - stir) * Math.min(1, dt * (stirring ? 6 : 0.9));
  U.uWalker.value.set(player.x, player.z, stir);

  camera.position.set(eye.x, eye.y, eye.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  sky.render(renderer, state.moonPower);
  shadows.render(renderer, camera.position, U.uKeyDir.value);
  renderer.render(scene, camera);

  if (++frames === 3) {
    loadingEl.classList.add('gone');
    window.__READY__ = true;
  }
  requestAnimationFrame(frame);
}

if (params.has('cam') || params.has('day') || params.has('stone')) titleEl.style.display = 'none';
resetExposure();
window.__ebb = { clock, player, terrain, U, lamps, interactions, jackdaws, sound, stats };
requestAnimationFrame(frame);
