import * as THREE from 'three';
import { noise2 } from '../world/noise';
import { COMMON_GLSL, LOGDEPTH_FRAG, LOGDEPTH_PARS_FRAG, LOGDEPTH_PARS_VERT, LOGDEPTH_VERT } from './glsl';
import { U } from './shared';

export type P3 = [number, number, number];
export type Color = [number, number, number];

/** What a surface is made of: decides how the shader grains and weathers it. */
export const Kind = { stone: 0, slate: 1, wood: 2, leaf: 3, glow: 4, iron: 5, wall: 6 } as const;

/**
 * Collects flat-shaded triangles for everything that is built rather than grown: the house, the stones, the walls.
 * Every triangle carries its own colour and material kind, so the whole lot is one mesh and one draw.
 */
export class Builder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private kind: number[] = [];

  tri(a: P3, b: P3, c: P3, color: Color, kind: number): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(color[0], color[1], color[2]);
      this.kind.push(kind);
    }
  }

  /** A four-sided face, corners given anticlockwise seen from outside. */
  quad(a: P3, b: P3, c: P3, d: P3, color: Color, kind: number): void {
    this.tri(a, b, c, color, kind);
    this.tri(a, c, d, color, kind);
  }

  /**
   * A box. `at` is the centre of its base, `half` its half sizes along its own x and z, `height` how tall. `yaw` turns
   * it about the vertical. `rough` moves each corner by up to that many metres, so that nothing is quite square.
   */
  box(at: P3, half: [number, number], height: number, yaw: number, color: Color, kind: number, rough = 0, seed = 0): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const corner = (sx: number, sy: number, sz: number, i: number): P3 => {
      const jx = rough ? rough * noise2(i * 3.7 + seed, 1.3 + seed * 0.7, 201) : 0;
      const jy = rough ? rough * noise2(i * 5.1 + seed, 9.1 + seed * 0.3, 202) * (sy > 0 ? 1 : 0) : 0;
      const jz = rough ? rough * noise2(i * 2.3 + seed, 4.7 + seed * 0.9, 203) : 0;
      const lx = sx * half[0] + jx;
      const lz = sz * half[1] + jz;
      return [at[0] + lx * c - lz * s, at[1] + (sy > 0 ? height : 0) + jy, at[2] + lx * s + lz * c];
    };
    const p = [
      corner(-1, 0, -1, 0),
      corner(1, 0, -1, 1),
      corner(1, 0, 1, 2),
      corner(-1, 0, 1, 3),
      corner(-1, 1, -1, 4),
      corner(1, 1, -1, 5),
      corner(1, 1, 1, 6),
      corner(-1, 1, 1, 7),
    ];
    this.quad(p[4], p[7], p[6], p[5], color, kind); // top
    this.quad(p[0], p[1], p[2], p[3], color, kind); // bottom
    this.quad(p[3], p[2], p[6], p[7], color, kind); // +z
    this.quad(p[1], p[0], p[4], p[5], color, kind); // -z
    this.quad(p[2], p[1], p[5], p[6], color, kind); // +x
    this.quad(p[0], p[3], p[7], p[4], color, kind); // -x
  }

  /**
   * A lump: a ball pulled into shape by `radii` and roughened. Used for standing stones and for the crowns of trees.
   * `lean` shifts the top sideways (x, z) by that much per metre of height.
   */
  lump(at: P3, radii: P3, color: Color, kind: number, seed: number, rough = 0.18, lean: [number, number] = [0, 0], detail = 2): void {
    const geo = new THREE.IcosahedronGeometry(1, detail);
    const src = geo.getAttribute('position');
    const pts: P3[] = [];
    for (let i = 0; i < src.count; i++) {
      const x = src.getX(i);
      const y = src.getY(i);
      const z = src.getZ(i);
      const k = 1 + rough * (noise2(x * 1.7 + seed, y * 1.7 + z * 1.3 + seed * 0.37, 211) + 0.5 * noise2(x * 4.1 + z * 2.2 + seed, y * 4.1 - seed, 212));
      const py = y * radii[1] * k;
      pts.push([at[0] + x * radii[0] * k + lean[0] * (py + radii[1]), at[1] + py, at[2] + z * radii[2] * k + lean[1] * (py + radii[1])]);
    }
    for (let i = 0; i + 2 < pts.length; i += 3) this.tri(pts[i], pts[i + 1], pts[i + 2], color, kind);
    geo.dispose();
  }

  mesh(): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    geo.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(this.kind), 1));
    const mesh = new THREE.Mesh(geo, builtMaterial());
    mesh.frustumCulled = false;
    return mesh;
  }
}

function builtMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uFarLit: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec3 aColor;
      attribute float aKind;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vColor;
      varying float vKind;
      ${LOGDEPTH_PARS_VERT}
      void main() {
        vec3 p = position;
        if (aKind > 2.5 && aKind < 3.5) {
          // leaves move in the wind
          p.x += 0.05 * sin(uTime * 1.9 + position.z * 1.3 + position.y * 0.7);
          p.y += 0.025 * sin(uTime * 2.6 + position.x * 1.7);
        }
        vec4 world = modelMatrix * vec4(p, 1.0);
        vPos = world.xyz;
        vNormal = mat3(modelMatrix) * normal;
        vColor = aColor;
        vKind = aKind;
        gl_Position = projectionMatrix * viewMatrix * world;
        ${LOGDEPTH_VERT}
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON_GLSL}
      uniform float uFarLit;
      uniform vec3 uStones[12];
      uniform vec2 uMoons[12];
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vColor;
      varying float vKind;
      ${LOGDEPTH_PARS_FRAG}
      void main() {
        ${LOGDEPTH_FRAG}
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 albedo = vColor;
        float g1 = vnoise(vPos.xz * 3.1 + vPos.y * 2.3);
        float g2 = vnoise(vPos.xy * 11.0 + vPos.z * 7.0);
        vec3 col;
        if (vKind > 3.5 && vKind < 4.5) {
          // a flame behind glass: the house lamp always burns, the far lamp only once it has been lit
          float power = vColor.b > 0.5 ? uLampPower[1] : uLampPower[0];
          col = LAMP_COLOR * (0.02 + 14.0 * power) + vec3(0.02, 0.025, 0.03) * skyAmbient(n);
        } else {
          if (vKind < 0.5 || vKind > 5.5) {
            if (vKind > 5.5) {
              // a wall of coursed rubble: rows of stones with dark joints between them
              float u = abs(n.x) > abs(n.z) ? vPos.z : vPos.x;
              // the courses wander a little, and every course has stones of its own length
              float v = vPos.y * 6.2 + 0.5 * vnoise(vec2(u * 1.1, vPos.y * 0.8));
              float row = floor(v);
              float uu = u * (2.2 + 1.9 * hash12(vec2(row, 5.0))) + hash12(vec2(row, 3.0)) * 7.0;
              vec2 id = vec2(floor(uu), row);
              vec2 f = vec2(fract(uu), fract(v));
              float joint = smoothstep(0.0, 0.09, f.x) * smoothstep(1.0, 0.91, f.x) * smoothstep(0.0, 0.16, f.y) * smoothstep(1.0, 0.84, f.y);
              joint = mix(joint, 1.0, smoothstep(0.6, 0.9, abs(n.y)));
              albedo *= (0.8 + 0.34 * hash12(id)) * mix(0.5, 1.0, joint) * (0.84 + 0.32 * g2);
              albedo = mix(albedo, albedo * vec3(1.12, 1.0, 0.86), hash12(id + 7.0));
            } else {
              albedo *= 0.74 + 0.34 * g1 + 0.14 * g2;
            }
            // the sea marks everything it covers: weed low down, a pale band of barnacles above it
            float weed = smoothstep(4.6, 1.2, vPos.y + (g1 - 0.5) * 1.8) * (vKind > 5.5 ? 0.35 + 0.6 * smoothstep(0.35, 0.6, g1) : 1.0);
            albedo = mix(albedo, vec3(0.055, 0.062, 0.03) * (0.7 + 0.6 * g2), weed * 0.9);
            albedo = mix(albedo, vec3(0.50, 0.48, 0.43), smoothstep(1.0, 0.0, abs(vPos.y - 5.6)) * step(0.5, g2) * 0.45);
            float wet = 1.0 - smoothstep(uTide, max(uWetLine, uTide + 0.05), vPos.y);
            albedo *= mix(1.0, 0.6, wet);
            if (vKind < 0.5 && normalize(vNormal).x > 0.2) {
              // On the landward face of each standing stone a moon is pecked into the rock: as full, and as large,
              // as the moon must be before the sea will leave that stone. Beside it, on the stones that need a
              // moon nearly full, the same circle left empty: the new moon pulls as hard.
              for (int i = 0; i < 12; i++) {
                vec3 d = vPos - uStones[i];
                if (abs(d.x) > 1.3 || abs(d.z) > 0.9 || abs(d.y) > 0.5) continue;
                float full = uMoons[i].x;
                float R = 0.17 * (0.55 + 2.4 * (uMoons[i].y - 0.89));
                vec2 m = (d.zy - vec2(-0.17, 0.0)) / R;
                float r = length(m);
                float litPart = smoothstep(1.0, 0.93, r) * smoothstep(-0.05, 0.05, m.x - (1.0 - 2.0 * full) * sqrt(max(1.0 - m.y * m.y, 0.0)));
                float rim = smoothstep(0.12, 0.04, abs(r - 1.0));
                float twin = smoothstep(0.12, 0.04, abs(length((d.zy - vec2(0.3, 0.0)) / R) - 1.0)) * smoothstep(0.6, 0.72, full);
                float carved = max(max(litPart * (0.6 + 0.4 * g2), rim), twin);
                albedo = mix(albedo, vec3(0.5, 0.48, 0.43) * mix(1.0, 0.6, wet), carved * 0.85);
              }
            }
          } else if (vKind < 1.5) {
            albedo *= 0.78 + 0.3 * vnoise(vPos.xz * vec2(2.2, 7.0) + vPos.y * 5.0);
          } else if (vKind < 2.5) {
            albedo *= 0.7 + 0.4 * vnoise(vec2(vPos.y * 26.0 + g1 * 5.0, dot(vPos.xz, vec2(2.3, 1.9))));
          } else if (vKind < 3.5) {
            albedo *= 0.65 + 0.6 * g2;
          } else {
            albedo *= 0.8 + 0.3 * g2;
          }
          float shadow = landShadow(vPos + n * 0.08) * builtShadow(vPos + n * 0.14, n);
          col = shade(albedo, n, vPos, shadow);
        }
        col = fogged(col, vPos);
        gl_FragColor = vec4(finish(col), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}
