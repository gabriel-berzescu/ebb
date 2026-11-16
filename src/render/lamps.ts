import * as THREE from 'three';
import { FAR_LAMP, FAR_LAMP_FLAME, LAMP } from '../world/layout';
import { noise2 } from '../world/noise';
import { U } from './shared';

/** How strongly a lamp lights the things around it (in the units of the sun's light). */
const LIGHT = 0.03;

function glowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCenter: { value: new THREE.Vector3() },
      uSize: { value: 0.5 },
      uPower: { value: 1 },
      uColor: { value: new THREE.Vector3(1, 0.62, 0.26) },
      uNight: U.uNight,
      uLogDepth: U.uLogDepth,
    },
    vertexShader: /* glsl */ `
      uniform vec3 uCenter;
      uniform float uSize;
      varying vec2 vUv;
      varying float vLogW;
      void main() {
        vUv = position.xy;
        vec4 mv = viewMatrix * vec4(uCenter, 1.0);
        // never smaller than a point of light: it has to be found from a kilometre away
        float size = max(uSize, length(mv.xyz) * 0.016);
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
        // hidden only by what hides the flame itself
        vLogW = 1.0 + gl_Position.w * 0.995 - 0.06;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uPower;
      uniform vec3 uColor;
      uniform float uNight;
      uniform float uLogDepth;
      varying vec2 vUv;
      varying float vLogW;
      void main() {
        gl_FragDepth = log2(max(vLogW, 1e-6)) * uLogDepth;
        float r = length(vUv);
        if (r > 1.0) discard;
        float core = exp(-r * r * 60.0);
        float halo = pow(1.0 - r, 3.0);
        vec3 c = uColor * (core * 2.4 + halo * mix(0.05, 0.6, uNight)) * uPower;
        gl_FragColor = vec4(c, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/** The two lamps: the one in the window that always burns, and the one far out on the sand that has to be lit. */
export class Lamps {
  readonly group = new THREE.Group();
  farLit = false;
  private house: THREE.ShaderMaterial;
  private far: THREE.ShaderMaterial;
  private farMesh: THREE.Mesh;

  constructor() {
    const quad = new THREE.PlaneGeometry(2, 2);
    this.house = glowMaterial();
    this.far = glowMaterial();
    const a = new THREE.Mesh(quad, this.house);
    this.farMesh = new THREE.Mesh(quad, this.far);
    for (const m of [a, this.farMesh]) {
      m.frustumCulled = false;
      m.renderOrder = 20;
      this.group.add(m);
    }
    U.uLampPos.value[0].set(LAMP[0], LAMP[1], LAMP[2]);
    U.uLampPos.value[1].set(FAR_LAMP.x, FAR_LAMP_FLAME + 0.08, FAR_LAMP.z);
    this.house.uniforms.uCenter.value.set(LAMP[0], LAMP[1], LAMP[2]);
  }

  update(realTime: number, tide: number): void {
    // a flame is never quite still
    const flicker = 1 + 0.07 * noise2(realTime * 6.1, 0.5, 401) + 0.04 * noise2(realTime * 17.3, 2.5, 402);
    U.uLampPower.value[0] = LIGHT * flicker;
    this.house.uniforms.uPower.value = flicker;
    this.house.uniforms.uSize.value = 0.42;

    U.uLampPower.value[1] = this.farLit ? LIGHT * (2 - flicker) : 0;
    this.farMesh.visible = this.farLit;
    if (this.farLit) {
      // under water the flame shows as a wider, greener glow on the surface above it
      const flame = FAR_LAMP_FLAME + 0.08;
      const under = Math.max(0, tide - flame);
      this.far.uniforms.uCenter.value.set(FAR_LAMP.x, Math.max(flame, tide + 0.03), FAR_LAMP.z);
      this.far.uniforms.uSize.value = 0.42 + Math.min(under, 6) * 0.9;
      this.far.uniforms.uPower.value = (2 - flicker) * (0.35 + 0.65 * Math.exp(-under * 0.25));
      const k = Math.min(1, under / 3);
      this.far.uniforms.uColor.value.set(1 - 0.35 * k, 0.62 + 0.12 * k, 0.26 + 0.3 * k);
    }
  }
}
