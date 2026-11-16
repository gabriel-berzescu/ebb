import * as THREE from 'three';
import { HIGHEST_TIDE } from '../world/constants';
import type { Terrain } from '../world/terrain';
import { COMMON_GLSL, LOGDEPTH_FRAG, LOGDEPTH_PARS_FRAG, LOGDEPTH_PARS_VERT, LOGDEPTH_VERT } from './glsl';
import { U } from './shared';

function waterMaterial(sea: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uSea: { value: sea ? 1 : 0 } },
    vertexShader: /* glsl */ `
      uniform float uTide;
      uniform float uSea;
      varying vec3 vPos;
      ${LOGDEPTH_PARS_VERT}
      void main() {
        vec3 p = position;
        if (uSea > 0.5) p.y = uTide;
        vPos = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        ${LOGDEPTH_VERT}
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON_GLSL}
      uniform float uSea;
      uniform vec3 uWalker;
      varying vec3 vPos;
      ${LOGDEPTH_PARS_FRAG}

      // three sizes of ripple; 'keep' drops the small ones with distance, where they would only shimmer
      float swell(vec2 p, vec3 keep) {
        float t = uTime;
        return keep.x * vnoise(p * 0.33 + vec2(0.31, 0.12) * t) + keep.y * 0.5 * vnoise(p * 0.87 - vec2(0.22, 0.4) * t) + keep.z * 0.22 * vnoise(p * 2.6 + vec2(-0.5, 0.33) * t);
      }

      void main() {
        ${LOGDEPTH_FRAG}
        vec2 guv = vPos.xz / uGroundSize + 0.5;
        bool inside = guv.x > 0.0 && guv.x < 1.0 && guv.y > 0.0 && guv.y < 1.0;
        vec2 g = inside ? texture2D(uGround, guv).rg : vec2(-40.0);
        float level = vPos.y;
        if (uSea > 0.5) {
          // ground the sea cannot reach at this height holds a pool of its own, or nothing
          if (g.g > uTide + 0.004) discard;
        } else {
          // the sea has risen over this pool
          if (uTide >= level - 0.004) discard;
        }
        float depth = level - g.r;
        // the edge breathes in and out a little
        float lap = uSea > 0.5 ? 0.02 + 0.02 * sin(uTime * 0.8 + vnoise(vPos.xz * 0.12) * 6.283) : 0.0;
        float edge = depth - lap;
        if (edge <= 0.0) discard;

        vec3 toEye = cameraPosition - vPos;
        float dist = length(toEye);
        vec3 V = toEye / dist;

        // ripples: quiet in the shallows and the pools, livelier over deep water, smoothed with distance
        float lively = uSea > 0.5 ? mix(0.10, 1.0, smoothstep(0.05, 3.0, depth)) : 0.07;
        float amp = lively * 0.32 / (1.0 + dist * 0.006);
        vec2 p = vPos.xz;
        // how much water one pixel covers: a ripple smaller than a few pixels is dropped
        float foot = length(fwidth(p));
        vec3 keep = 1.0 - smoothstep(0.12, 0.45, foot * vec3(0.33, 0.87, 2.6));
        float e = 0.4;
        float h0 = swell(p, keep);
        vec3 n = normalize(vec3(-(swell(p + vec2(e, 0.0), keep) - h0) / e * amp, 1.0, -(swell(p + vec2(0.0, e), keep) - h0) / e * amp));

        vec3 R = reflect(-V, n);
        R.y = abs(R.y) + 0.004 + 0.05 * smoothstep(300.0, 4000.0, dist);
        R = normalize(R);
        float F = 0.02 + 0.98 * pow(1.0 - max(dot(V, n), 0.0), 5.0);
        F *= 1.0 - 0.35 * smoothstep(300.0, 5000.0, dist) * lively;

        float through;
        vec3 refl = skyClouds(R, through);
        vec3 glitter = uSunDisc * 0.02 * pow(max(dot(R, uSunDir), 0.0), 520.0) + uMoonDisc * 2.0 * pow(max(dot(R, uMoonDir), 0.0), 420.0) * step(0.0, uMoonDir.y);
        refl += (moonAndStars(R) + glitter) * through;
        for (int i = 0; i < 2; i++) {
          vec3 L = uLampPos[i] - vPos;
          float d2 = dot(L, L);
          refl += LAMP_COLOR * uLampPower[i] * 9.0 * pow(max(dot(R, L * inversesqrt(d2)), 0.0), 180.0) / (1.0 + d2 * 0.002);
        }

        // the body of the water, lit from above
        vec3 light = uSunLight * max(uSunDir.y, 0.0) + uMoonLight * max(uMoonDir.y, 0.0) + skyAmbient(vec3(0.0, 1.0, 0.0));
        vec3 body = mix(vec3(0.09, 0.22, 0.19), vec3(0.012, 0.055, 0.065), 1.0 - exp(-depth * 0.4)) * light;
        float hide = 1.0 - exp(-depth * 0.8);

        vec3 col = mix(body, refl, F);
        float alpha = max(hide, F);

        // a line of foam where the sea meets the land
        float foam = uSea * smoothstep(0.07, 0.0, edge) * smoothstep(0.25, 0.75, vnoise(p * 2.4 + uTime * 0.25)) * smoothstep(0.0, 0.01, edge);
        col = mix(col, vec3(0.85) * light, foam * 0.7);
        alpha = mix(alpha, 1.0, foam * 0.7);
        alpha *= smoothstep(0.0, 0.015, edge);

        col = fogged(col, vPos);

        // At night the water is full of small living lights. A few glimmer by themselves; many more flare where
        // the water is stirred: round the legs of someone wading, and along the edge where the sea laps.
        if (uNight > 0.05) {
          // two sizes of point, each with its own brightness and its own slow flicker
          float spark = 0.0;
          float twinkle = 0.0;
          for (int layer = 0; layer < 2; layer++) {
            float sc = layer == 0 ? 13.0 : 29.0;
            vec2 cell = floor(p * sc) + float(layer) * 91.0;
            float rnd = hash12(cell);
            vec2 at = fract(p * sc) - 0.5 - (vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5) * 0.7;
            float tw = 0.5 + 0.5 * sin(uTime * (1.2 + rnd * 4.0) + rnd * 50.0);
            float one = smoothstep(0.05 + 0.09 * rnd * rnd, 0.0, length(at)) * step(0.4, rnd) * rnd * rnd;
            spark += one * (0.35 + 0.65 * tw) * (1.0 - smoothstep(0.012, 0.06, foot * sc / 13.0));
            twinkle += tw * 0.5;
          }
          vec2 toWalker = p - uWalker.xy;
          float stir = uWalker.z * exp(-dot(toWalker, toWalker) / 2.4);
          float lapping = uSea * smoothstep(0.2, 0.0, edge) * (0.4 + 0.6 * twinkle);
          float living = uNight * (spark * (0.1 * twinkle * twinkle + 2.6 * stir + 0.8 * lapping) + 0.1 * stir);
          col += vec3(0.1, 0.8, 0.66) * living * 0.9 / uExposure;
          alpha = max(alpha, clamp(living * 1.5, 0.0, 1.0) * smoothstep(0.0, 0.015, edge));
        }
        gl_FragColor = vec4(finish(col), alpha);
      }`,
    transparent: true,
    depthWrite: false,
  });
}

/** The sea: one level sheet at the height of the tide, out to the horizon. */
export function seaMesh(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(120000, 120000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, waterMaterial(true));
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return mesh;
}

/** Every pool the falling tide can leave behind, each a level sheet at its own rim height. */
export function poolsMesh(t: Terrain): THREE.Mesh {
  const { n, size, cell, h, fill } = t;
  const out: number[] = [];
  const wetAt = (k: number) => (fill[k] - h[k] > 0.03 && fill[k] < HIGHEST_TIDE ? fill[k] : -Infinity);
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const level = Math.max(wetAt(a), wetAt(a + 1), wetAt(a + n), wetAt(a + n + 1));
      if (level === -Infinity) continue;
      const x0 = -size / 2 + i * cell;
      const z0 = -size / 2 + j * cell;
      const x1 = x0 + cell;
      const z1 = z0 + cell;
      out.push(x0, level, z0, x0, level, z1, x1, level, z0, x1, level, z0, x0, level, z1, x1, level, z1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
  const mesh = new THREE.Mesh(geo, waterMaterial(false));
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return mesh;
}
