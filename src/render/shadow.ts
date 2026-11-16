import * as THREE from 'three';
import { U } from './shared';

const SIZE = 2048;
/** Half the width of the square of ground the shadow map covers, centred on the walker. */
const REACH = 70;
const DEPTH = 600;

/**
 * Shadows of built things (house, trees, stones, walls), from whichever of sun and moon is the brighter. The land's
 * own shadow is found differently, by marching along the height map, so it reaches right across the flats.
 */
export class Shadows {
  private target: THREE.WebGLRenderTarget;
  private camera = new THREE.OrthographicCamera(-REACH, REACH, REACH, -REACH, 1, DEPTH);
  private scene = new THREE.Scene();
  private toTexture = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  private v = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();

  constructor(casters: THREE.BufferGeometry) {
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: true, generateMipmaps: false });
    this.target.depthTexture = new THREE.DepthTexture(SIZE, SIZE, THREE.UnsignedIntType);
    const material = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `void main() { gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `void main() { gl_FragColor = vec4(1.0); }`,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(casters, material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    U.uShadowMap.value = this.target.depthTexture;
    U.uShadowTexel.value = 1 / SIZE;
  }

  render(renderer: THREE.WebGLRenderer, centre: THREE.Vector3, light: THREE.Vector3): void {
    if (light.y < 0.02) {
      U.uShadowOn.value = 0;
      return;
    }
    U.uShadowOn.value = 1;
    const cam = this.camera;
    cam.position.copy(centre).addScaledVector(light, DEPTH / 2);
    cam.up.set(0, 1, 0);
    cam.lookAt(centre);
    cam.updateMatrixWorld();
    // move in whole texels only, so shadow edges do not crawl as the walker moves
    const texel = (2 * REACH) / SIZE;
    this.v.copy(centre).applyMatrix4(cam.matrixWorldInverse);
    this.right.setFromMatrixColumn(cam.matrixWorld, 0);
    this.up.setFromMatrixColumn(cam.matrixWorld, 1);
    cam.position.addScaledVector(this.right, -(this.v.x % texel)).addScaledVector(this.up, -(this.v.y % texel));
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    U.uShadowMat.value.copy(this.toTexture).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);

    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, cam);
    renderer.setRenderTarget(before);
  }
}
