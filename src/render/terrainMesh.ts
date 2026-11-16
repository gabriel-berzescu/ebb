import * as THREE from 'three';
import type { Terrain } from '../world/terrain';
import { COMMON_GLSL, LOGDEPTH_FRAG, LOGDEPTH_PARS_FRAG, LOGDEPTH_PARS_VERT, LOGDEPTH_VERT } from './glsl';
import { U } from './shared';

/** The ground as a texture the shaders can read: red is ground height, green is the level a stranded pool stands at. */
export function groundTexture(t: Terrain): THREE.DataTexture {
  const data = new Float32Array(t.n * t.n * 2);
  for (let k = 0; k < t.n * t.n; k++) {
    data[2 * k] = t.h[k];
    data[2 * k + 1] = t.fill[k];
  }
  const tex = new THREE.DataTexture(data, t.n, t.n, THREE.RGFormat, THREE.FloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function terrainMesh(t: Terrain): THREE.Mesh {
  const { n, size, cell, h } = t;
  const pos = new Float32Array(n * n * 3);
  const nor = new Float32Array(n * n * 3);
  const mask = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      pos[3 * k] = -size / 2 + i * cell;
      pos[3 * k + 1] = h[k];
      pos[3 * k + 2] = -size / 2 + j * cell;
      const hl = h[j * n + Math.max(i - 1, 0)];
      const hr = h[j * n + Math.min(i + 1, n - 1)];
      const hu = h[Math.max(j - 1, 0) * n + i];
      const hd = h[Math.min(j + 1, n - 1) * n + i];
      const nx = hl - hr;
      const nz = hu - hd;
      const ny = 2 * cell;
      const len = Math.hypot(nx, ny, nz);
      nor[3 * k] = nx / len;
      nor[3 * k + 1] = ny / len;
      nor[3 * k + 2] = nz / len;
      mask[2 * k] = t.rock[k];
      mask[2 * k + 1] = t.path[k];
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx[q++] = a;
      idx[q++] = c;
      idx[q++] = b;
      idx[q++] = b;
      idx[q++] = c;
      idx[q++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      attribute vec2 aMask;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec2 vMask;
      ${LOGDEPTH_PARS_VERT}
      void main() {
        vPos = position;
        vNormal = normal;
        vMask = aMask;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        ${LOGDEPTH_VERT}
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON_GLSL}
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec2 vMask;
      ${LOGDEPTH_PARS_FRAG}

      void main() {
        ${LOGDEPTH_FRAG}
        vec3 n = normalize(vNormal);
        vec3 toEye = cameraPosition - vPos;
        float dist = length(toEye);
        vec3 V = toEye / dist;
        vec2 xz = vPos.xz;
        float h = vPos.y;
        float slope = 1.0 - n.y;
        float close = 1.0 - smoothstep(18.0, 70.0, dist);

        // fine detail fades out with distance, where it would only shimmer
        float fine = 1.0 - smoothstep(40.0, 180.0, dist);
        float n1 = vnoise(xz * 0.07);
        float n2 = mix(0.5, vnoise(xz * 0.9), fine);
        float n3 = fbm3(xz * 0.031);

        // what covers the ground here
        float rockW = clamp(max(smoothstep(0.25, 0.7, vMask.x + (n2 - 0.5) * 0.3), smoothstep(0.30, 0.5, slope)), 0.0, 1.0);
        float grassW = smoothstep(8.1, 9.0, h + (vnoise(xz * 0.23) - 0.5) * 0.9) * (1.0 - smoothstep(0.22, 0.42, slope));
        float shingleW = smoothstep(2.7, 4.0, h + (n1 - 0.5) * 1.2) * (1.0 - grassW);
        float pathW = smoothstep(0.35, 0.65, vMask.y);

        vec2 pool = texture2D(uGround, xz / uGroundSize + 0.5).rg;
        float inPool = smoothstep(0.0, 0.35, pool.g - h);

        // colours
        vec3 sand = mix(vec3(0.60, 0.50, 0.35), vec3(0.47, 0.40, 0.29), n3);
        sand = mix(sand, vec3(0.30, 0.27, 0.21), inPool * 0.7);
        float stones = mix(0.5, vnoise(xz * 9.0) * 0.6 + vnoise(xz * 23.0) * 0.4, close);
        vec3 pebble = mix(vec3(0.13, 0.125, 0.12), vec3(0.33, 0.29, 0.24), stones * 0.7 + n2 * 0.3);
        vec3 grass = mix(vec3(0.10, 0.16, 0.045), vec3(0.19, 0.23, 0.07), fbm3(xz * 0.11));
        grass = mix(grass, vec3(0.27, 0.25, 0.11), smoothstep(0.55, 0.85, vnoise(xz * 0.45)) * 0.55);
        float nearby = 1.0 - smoothstep(4.0, 16.0, dist);
        grass *= 1.0 + (vnoise(xz * 1.9) - 0.5) * 0.5 * fine + (vnoise(xz * 8.0) - 0.5) * 0.6 * close + (vnoise(xz * 27.0) - 0.5) * 0.5 * close * close + (vnoise(xz * 70.0) + vnoise(xz * 160.0) - 1.0) * 0.45 * nearby;
        vec3 rock = mix(vec3(0.13, 0.125, 0.12), vec3(0.27, 0.25, 0.22), fbm3(xz * 0.3 + h * 0.8));
        rock = mix(rock, vec3(0.36, 0.33, 0.17), smoothstep(0.68, 0.8, vnoise(xz * 1.7)) * smoothstep(8.0, 10.0, h) * 0.5 * fine);
        float weed = smoothstep(3.6, 0.8, h + (n2 - 0.5) * 1.6);
        rock = mix(rock, vec3(0.10, 0.11, 0.04), weed * (0.55 + 0.45 * n2));
        vec2 cobXZ = xz * 1.7 + vec2(floor(xz.y * 1.7) * 0.5, 0.0);
        vec2 cobF = abs(fract(cobXZ) - 0.5);
        vec3 cobble = vec3(0.36, 0.35, 0.33) * (0.7 + 0.5 * hash12(floor(cobXZ))) * (1.0 - 0.45 * smoothstep(0.38, 0.5, max(cobF.x, cobF.y)));
        cobble = mix(cobble, vec3(0.13, 0.14, 0.07), weed * 0.5);

        vec3 albedo = mix(sand, pebble, shingleW);
        albedo = mix(albedo, grass, grassW);
        albedo = mix(albedo, rock, rockW);
        albedo = mix(albedo, cobble, pathW);
        float soft = (1.0 - rockW) * (1.0 - shingleW) * (1.0 - grassW) * (1.0 - pathW);

        // small relief: ripples in the sand, grain everywhere
        vec2 rdir = normalize(vec2(0.25, 1.0) + 0.5 * vec2(vnoise(xz * 0.02) - 0.5, 0.0));
        float rphase = dot(xz, rdir) * 14.0 + 9.0 * vnoise(xz * 0.23) + 2.5 * vnoise(xz * 1.3);
        // ripples are drawn only where a pixel is much smaller than one of them
        float ripple = cos(rphase) * 0.13 * soft * (1.0 - smoothstep(0.5, 1.6, fwidth(rphase)));
        vec3 nd = normalize(n + vec3(rdir.x * ripple, 0.0, rdir.y * ripple) + (vec3(n2, 0.0, vnoise(xz * 0.9 + 31.0)) - vec3(0.5, 0.0, 0.5)) * 0.25 * (1.0 - soft * 0.7) * close);

        // wetness: 1 at the water's edge, fading up to the line the last high water reached
        float span = max(uWetLine - uTide, 0.05);
        float wet = 1.0 - smoothstep(0.0, 1.0, (h - uTide) / span);
        wet = max(wet, smoothstep(0.3, 0.0, h - pool.g) * step(h + 0.001, pool.g + 0.3) * step(pool.g, uWetLine + 0.5));
        albedo *= mix(1.0, 0.52, wet);

        float shadow = landShadow(vPos + n * 0.05) * builtShadow(vPos + n * 0.1, n);
        vec3 col = shade(albedo, nd, vPos, shadow);

        // a film of water on the wettest sand: it mirrors the sky
        float patchy = fbm3(xz * 0.045);
        float film = smoothstep(0.42, 0.98, wet + (patchy - 0.5) * 0.9) * (soft * 0.92 + 0.08) * smoothstep(0.12, 0.0, slope) * 0.74;
        vec3 nf = normalize(mix(vec3(0.0, 1.0, 0.0), nd, 0.02 + 0.07 * (1.0 - film)));
        vec3 R = reflect(-V, nf);
        R.y = abs(R.y) + 0.002;
        R = normalize(R);
        float F = 0.025 + 0.975 * pow(1.0 - max(dot(V, nf), 0.0), 5.0);
        float through;
        vec3 refl = skyClouds(R, through);
        refl += (moonAndStars(R) + uSunDisc * 0.012 * pow(max(dot(R, uSunDir), 0.0), 700.0) * shadow) * through;
        col = mix(col, refl, F * film);

        col = fogged(col, vPos);
        gl_FragColor = vec4(finish(col), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}
