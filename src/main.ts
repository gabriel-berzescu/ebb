import * as THREE from 'three';
import shelfData from '../shelf.json';
import { Interactions } from './game/interact';
import { Player, type Controls } from './game/player';
import { Jackdaws } from './render/jackdaws';
import { Lamps } from './render/lamps';
import { FAR, resetExposure, U, updateShared } from './render/shared';
import { Shadows } from './render/shadow';
import { Sky } from './render/sky';
import { buildStructures, type ShelfItem } from './render/structures';
import { groundTexture, terrainMesh } from './render/terrainMesh';
import { poolsMesh, seaMesh } from './render/water';
import { DAY } from './world/constants';
import { Clock } from './world/clock';
import { HOUSE, housePoint } from './world/layout';
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
  const cam = params.get('cam');
  if (cam) {
    const [x, z, yawDeg, pitchDeg] = cam.split(',').map(Number);
    player.place(x, z, ((yawDeg ?? 0) * Math.PI) / 180, ((pitchDeg ?? 0) * Math.PI) / 180);
  }
}

const interactions = new Interactions(player, clock, lamps, shelf, hintEl, noteEl);
if (params.has('lit')) lamps.farLit = params.get('lit') !== '0';
if (params.has('sit')) interactions.sit();

const keys = new Set<string>();
let lookX = 0;
let lookY = 0;
let act = false;
let padActWas = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !e.repeat) act = true;
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
canvas.addEventListener('click', () => {
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
    if (pad.buttons.some((b) => b.pressed)) titleEl.classList.add('gone');
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

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  realTime += dt;
  clock.advance(dt);

  const state = updateShared(clock.t, realTime, dt);
  const controls = readControls(dt);
  interactions.update(dt, state.tide, act, Math.hypot(controls.moveX, controls.moveZ) > 0.3, controls.run);
  act = false;
  player.update(dt, controls, state.tide);
  lamps.update(realTime, state.tide);
  jackdaws.update(dt, state.heavens.sunDir[1], state.tide);
  const eye = player.eye();
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

if (params.has('cam') || params.has('day')) titleEl.style.display = 'none';
resetExposure();
window.__ebb = { clock, player, terrain, U, lamps, interactions, jackdaws };
requestAnimationFrame(frame);
