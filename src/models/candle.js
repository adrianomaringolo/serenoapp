// Velas: três círios de cera sobre um prato de pedra, com chama em shader
// (tremula sozinha) e uma luz quente emprestada do LightPool.
import * as THREE from 'three';
import { paintGeometry, globalUniforms, bakeGroup } from '../core/materials.js';
import { rng, smoothstep } from '../core/noise.js';
import { getKit } from './kit.js';

const flameMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: globalUniforms.uTime },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying float vH;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vec3 p = position;
      float s = modelMatrix[3].x * 37.0 + modelMatrix[3].z * 11.0 + modelMatrix[3].y * 53.0;
      float h = clamp(p.y / 0.09, 0.0, 1.0);
      float sway = sin(uTime * 7.0 + s) * 0.6 + sin(uTime * 13.1 + s * 1.7) * 0.4;
      p.x += sway * 0.006 * h * h;
      p.z += cos(uTime * 5.7 + s) * 0.004 * h * h;
      p.y *= 1.0 + 0.12 * sin(uTime * 10.0 + s * 3.0);
      vH = h;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying float vH;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      float rim = abs(dot(normalize(vN), normalize(vV)));
      vec3 core = vec3(1.0, 0.93, 0.7);
      vec3 outer = vec3(1.0, 0.45, 0.08);
      vec3 col = mix(core, outer, smoothstep(0.25, 0.95, vH) * 0.7 + (1.0 - rim) * 0.5);
      col = mix(vec3(0.25, 0.35, 1.0), col, smoothstep(0.0, 0.18, vH)); // base azulada
      float a = pow(rim, 1.2) * (1.0 - smoothstep(0.7, 1.0, vH) * 0.6);
      gl_FragColor = vec4(col * 3.5 * a, a);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const flameGeo = new THREE.LatheGeometry(
  [[0, 0], [0.012, 0.008], [0.019, 0.025], [0.017, 0.045], [0.01, 0.068], [0, 0.095]].map(([x, y]) => new THREE.Vector2(x, y)),
  12,
);

export function createFlame() {
  return new THREE.Mesh(flameGeo, flameMaterial);
}

function waxGeometry(r, h, seed) {
  const R = rng(seed);
  const dip = 0.012 + R() * 0.01;
  const pts = [
    [0, 0], [r, 0], [r * 1.01, h * 0.5], [r * 1.0, h - 0.012], [r * 0.95, h], [r * 0.7, h - dip * 0.4], [r * 0.25, h - dip], [0, h - dip],
  ];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 24);
  // escorridos de cera: ondula a borda de cima
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const drip = Math.max(0, Math.sin(a * 5 + seed) * Math.sin(a * 3 + seed * 2)) * 0.012;
    if (y > h * 0.6) {
      const k = smoothstep(h * 0.6, h, y);
      pos.setXYZ(i, x * (1 + drip * 8 * k), y, z * (1 + drip * 8 * k));
    }
  }
  g.computeVertexNormals();
  paintGeometry(g, 0xf1e4cc, (c, x, y) => c.multiplyScalar(0.85 + 0.2 * smoothstep(0, h, y)));
  return g;
}

const waxMat = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.5, emissive: 0xff9a40, emissiveIntensity: 0.06,
});
const wickMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 1 });

export function createCandles(seed = 1) {
  const kit = getKit();
  const R = rng(seed * 17 + 1);
  const group = new THREE.Group();

  // prato de pedra
  const plate = new THREE.LatheGeometry(
    [[0, 0], [0.24, 0], [0.27, 0.02], [0.27, 0.035], [0.22, 0.04], [0, 0.04]].map(([x, y]) => new THREE.Vector2(x, y)),
    28,
  );
  paintGeometry(plate, 0x5b5955);
  const pm = new THREE.Mesh(plate, kit.stoneFine);
  pm.castShadow = pm.receiveShadow = true;
  group.add(pm);

  const n = 3;
  const spots = [[-0.08, -0.05], [0.09, -0.03], [0.0, 0.09]];
  for (let i = 0; i < n; i++) {
    const r = 0.045 + R() * 0.02;
    const h = 0.12 + R() * 0.22;
    const wax = new THREE.Mesh(waxGeometry(r, h, seed + i * 7), waxMat);
    wax.castShadow = true;
    wax.receiveShadow = true;
    wax.position.set(spots[i][0], 0.04, spots[i][1]);
    group.add(wax);
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 5), wickMat);
    wick.position.set(spots[i][0], 0.04 + h - 0.012, spots[i][1]);
    group.add(wick);
    const f = createFlame();
    f.userData.keep = true; // a chama se anima pela própria posição: não entra no bake
    f.position.set(spots[i][0], 0.04 + h - 0.004, spots[i][1]);
    group.add(f);
  }
  bakeGroup(group);
  group.userData.radius = 0.32;
  group.userData.material = 'stone';
  group.userData.lights = [{ offset: new THREE.Vector3(0, 0.38, 0), color: 0xff9a45, intensity: 2.2, distance: 5, flicker: true, day: 0.35 }];
  return group;
}
