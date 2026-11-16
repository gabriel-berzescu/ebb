import * as THREE from 'three';
import { DAY, LATITUDE, SUN_RADIUS } from '../world/constants';
import { ATMOS, luminance, skyRadiance, transmittance } from '../world/atmosphere';
import { heavens, tideAt, wetLine, type Heavens, type Vec3 } from '../world/heavens';
import { HOUSE, STONES } from '../world/layout';
import { noise2, smoothstep } from '../world/noise';

/** Brightness of the full moon against the sun. Far brighter than the real one, so that moonlit nights can be walked in. */
const MOON_POWER = 0.004;
/** Light of the night sky itself when neither sun nor moon is up. */
const NIGHT_FLOOR = 0.0007;
/** Longest distance anything is drawn at. */
export const FAR = 60000;

/** Uniforms every material shares. Each entry is one object, so setting its value sets it everywhere. */
export const U = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
  uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunLight: { value: new THREE.Vector3() },
  uMoonLight: { value: new THREE.Vector3() },
  uCloudLight: { value: new THREE.Vector3() },
  uSunDisc: { value: new THREE.Vector3() },
  uMoonDisc: { value: new THREE.Vector3() },
  uSunRadius: { value: SUN_RADIUS },
  uMoonRadius: { value: 0.0115 },
  uStarGain: { value: 0.03 },
  uSkyLUT: { value: null as THREE.Texture | null },
  uExposure: { value: 0.3 },
  uNight: { value: 0 },
  uStarRot: { value: new THREE.Matrix3() },
  uCloudCover: { value: 0.4 },
  uCloudOffset: { value: new THREE.Vector2() },
  uTide: { value: 0 },
  uWetLine: { value: 0 },
  uGround: { value: null as THREE.Texture | null },
  uGroundSize: { value: 2400 },
  uLampPos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  uLampPower: { value: [1, 0] },
  uFog: { value: 0.000035 },
  uLogDepth: { value: 1 / Math.log2(FAR + 1) },
  uShadowMap: { value: null as THREE.Texture | null },
  uShadowMat: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },
  uShadowTexel: { value: 1 / 2048 },
  // the house, for knowing what is indoors: its middle at floor height, its two axes, its half sizes and height
  uHousePos: { value: new THREE.Vector3(HOUSE.x, HOUSE.floor, HOUSE.z) },
  uHouseAxes: { value: new THREE.Vector4(HOUSE.side[0], HOUSE.side[1], HOUSE.front[0], HOUSE.front[1]) },
  uHouseSize: { value: new THREE.Vector3(HOUSE.width / 2 - HOUSE.thick, HOUSE.depth / 2 - HOUSE.thick, HOUSE.wall + 1.75) },
  // the standing stones and the moon carved on each: (x, height of the carving, z) and (how full, how large)
  uStones: { value: STONES.map((s) => new THREE.Vector3(s.x, s.ground + 1.5, s.z)) },
  uMoons: { value: STONES.map((s) => new THREE.Vector2(s.lit, s.size)) },
  // where the walker is, and how much they are stirring the water (for the light in the water at night)
  uWalker: { value: new THREE.Vector3() },
};

export interface SkyState {
  heavens: Heavens;
  tide: number;
  wetLine: number;
  /** Power of the moon as a light, relative to the sun. */
  moonPower: number;
  /** 0 by day, 1 in full night. */
  night: number;
}

const POLE = new THREE.Vector3(0, Math.sin(LATITUDE), -Math.cos(LATITUDE));
const m4 = new THREE.Matrix4();
let exposure = -1;

const scaled = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

/** Set every shared uniform for world time t. `dt` is real seconds since the last call (the eye adapts over real time). */
export function updateShared(t: number, realTime: number, dt: number): SkyState {
  const hv = heavens(t);
  const sun = hv.sunDir;
  const moon = hv.moonDir;
  U.uTime.value = realTime;
  U.uSunDir.value.set(sun[0], sun[1], sun[2]);
  U.uMoonDir.value.set(moon[0], moon[1], moon[2]);
  U.uMoonRadius.value = hv.moonRadius;

  // direct light: what is left of each body's light after the air
  const sunUp = smoothstep(-0.012, 0.012, sun[1]);
  const moonUp = smoothstep(-0.014, 0.014, moon[1]);
  const moonPower = MOON_POWER * hv.moonLit;
  const tSun = transmittance(sun);
  const tMoon = transmittance(moon);
  const sunLight = scaled(tSun, (ATMOS.sun / Math.PI) * sunUp);
  const moonLight = scaled(tMoon, (ATMOS.sun / Math.PI) * moonPower * moonUp);
  U.uSunLight.value.set(sunLight[0], sunLight[1], sunLight[2]);
  U.uMoonLight.value.set(moonLight[0], moonLight[1], moonLight[2]);
  // clouds stand high and still see the sun for a while after it has set
  const raised: Vec3 = [sun[0], sun[1] + 0.055, sun[2]];
  const rl = Math.hypot(raised[0], raised[1], raised[2]);
  const tCloud = transmittance([raised[0] / rl, raised[1] / rl, raised[2] / rl]);
  const cloudUp = smoothstep(-0.11, -0.02, sun[1]);
  U.uCloudLight.value.set(tCloud[0], tCloud[1], tCloud[2]).multiplyScalar((ATMOS.sun / Math.PI) * cloudUp);
  U.uSunDisc.value.set(tSun[0], tSun[1], tSun[2]).multiplyScalar(900);

  // the brighter body casts the shadows
  if (sunUp > 0.001) U.uKeyDir.value.copy(U.uSunDir.value);
  else U.uKeyDir.value.copy(U.uMoonDir.value);

  // stars turn about the pole once a day
  m4.makeRotationAxis(POLE, hv.starAngle);
  U.uStarRot.value.setFromMatrix4(m4);

  // weather: cloud cover wanders over days, the clouds drift on a west wind
  const days = t / DAY;
  U.uCloudCover.value = 0.4 + 0.34 * noise2(days * 0.83, 7.3, 91);
  U.uCloudOffset.value.set(t * 6e-5, t * 2.1e-5);

  // meter the light, as a camera would
  const dirs: Vec3[] = [
    [0, 1, 0],
    [0.94, 0.342, 0],
    [-0.94, 0.342, 0],
    [0, 0.342, 0.94],
    [0, 0.342, -0.94],
  ];
  let sky = 0;
  for (const d of dirs) {
    if (sun[1] > -0.35) sky += luminance(skyRadiance(d, sun, ATMOS.sun));
    if (moonPower > 0 && moon[1] > -0.2) sky += luminance(skyRadiance(d, moon, ATMOS.sun * moonPower));
  }
  sky = sky / dirs.length + NIGHT_FLOOR;
  const groundLight = 0.3 * (luminance(sunLight) * Math.max(sun[1], 0) + luminance(moonLight) * Math.max(moon[1], 0));
  const meter = sky * 0.5 + groundLight;
  const target = Math.min(90, Math.max(0.12, 0.31 * Math.pow(meter, -0.65)));
  exposure = exposure < 0 || dt <= 0 ? target : exposure + (target - exposure) * (1 - Math.exp(-dt * 1.6));
  U.uExposure.value = exposure;
  const night = 1 - smoothstep(-2.6, -0.7, Math.log10(meter));
  U.uNight.value = night;

  // the moon's face is shown at a brightness the eye can read at any hour
  const face = Math.min(0.55, 0.85 / exposure);
  U.uMoonDisc.value.set(1.0, 0.97, 0.9).multiplyScalar(face);

  const tide = tideAt(t);
  const wet = Math.max(wetLine(t), tide);
  U.uTide.value = tide;
  U.uWetLine.value = wet;

  return { heavens: hv, tide, wetLine: wet, moonPower, night };
}

/** For screenshots: forget the eye's adaptation so the next frame is metered fresh. */
export function resetExposure(): void {
  exposure = -1;
}
