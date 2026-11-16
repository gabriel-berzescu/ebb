import * as THREE from 'three';
import { ATMOS } from '../world/atmosphere';
import { ATMOSPHERE_GLSL, COMMON_GLSL } from './glsl';
import { U } from './shared';

/**
 * The sky is computed once per frame into a small texture (direction -> colour of the air), and everything else looks
 * it up: the dome, reflections, fog, the light on the ground.
 */
export class Sky {
  readonly lut: THREE.WebGLRenderTarget;
  readonly dome: THREE.Mesh;
  private lutScene = new THREE.Scene();
  private lutCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private lutMaterial: THREE.ShaderMaterial;

  constructor() {
    this.lut = new THREE.WebGLRenderTarget(256, 128, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      generateMipmaps: false,
    });
    U.uSkyLUT.value = this.lut.texture;

    this.lutMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: U.uSunDir,
        uMoonDir: U.uMoonDir,
        uMoonPower: { value: 0 },
        uFloor: { value: new THREE.Vector3(0.00045, 0.0006, 0.0011) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        ${ATMOSPHERE_GLSL}
        uniform vec3 uSunDir;
        uniform vec3 uMoonDir;
        uniform float uMoonPower;
        uniform vec3 uFloor;
        varying vec2 vUv;
        void main() {
          float lon = (vUv.x - 0.5) * 2.0 * A_PI;
          float lat = (vUv.y - 0.5) * A_PI;
          vec3 d = vec3(cos(lat) * cos(lon), max(sin(lat), 0.0), cos(lat) * sin(lon));
          d = normalize(d);
          vec3 c = atmosphere(d, uSunDir, ${ATMOS.sun.toFixed(1)});
          if (uMoonPower > 0.0) c += atmosphere(d, uMoonDir, ${ATMOS.sun.toFixed(1)} * uMoonPower);
          gl_FragColor = vec4(c + uFloor, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.lutMaterial);
    quad.frustumCulled = false;
    this.lutScene.add(quad);

    const domeMaterial = new THREE.ShaderMaterial({
      uniforms: { ...U },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        ${COMMON_GLSL}
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 c = skyAll(vec3(d.x, max(d.y, 0.0), d.z));
          gl_FragColor = vec4(finish(c), 1.0);
        }`,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
    });
    this.dome = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), domeMaterial);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
  }

  /** Recompute the air for the current sun and moon. Call after updateShared and before drawing the scene. */
  render(renderer: THREE.WebGLRenderer, moonPower: number): void {
    this.lutMaterial.uniforms.uMoonPower.value = moonPower;
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(this.lut);
    renderer.render(this.lutScene, this.lutCamera);
    renderer.setRenderTarget(before);
  }
}
