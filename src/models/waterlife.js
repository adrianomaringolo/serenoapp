// Elementos para pôr na água do lago: vela flutuante em flor de lótus, pedra
// que aflora e lanterna de pedra de lago (yukimi-dōrō). Os bichos têm arquivo
// próprio: heron.js (garça) e ducks.js (patos-mandarim).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../core/noise.js';
import { paintGeometry, bakeGroup } from '../core/materials.js';
import { createFlame } from './candle.js';
import { lanternGlow, lanternHalo } from './lantern.js';
import { createRock } from './rock.js';
import { getKit } from './kit.js';

// ---------------------------------------------------------------------------
// Vela flutuante: flor de papel aberta com uma vela no meio
// ---------------------------------------------------------------------------
function paperPetal(len, wid) {
  const g = new THREE.PlaneGeometry(wid, len, 3, 4);
  g.translate(0, len / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const t = Math.min(Math.max(y / len, 0), 1);
    const w = Math.sin(Math.min(t, 0.999) * Math.PI * 0.85 + 0.25) * (1 - t * 0.5);
    const nx = x * w;
    pos.setXYZ(i, nx, y, -Math.pow(nx / wid, 2) * 0.05 + t * t * 0.02);
  }
  g.computeVertexNormals();
  return g;
}

const petalPaper = new THREE.MeshStandardMaterial({ color: 0xf9d3df, emissive: 0xff8aa8, emissiveIntensity: 0.4, roughness: 0.9, side: THREE.DoubleSide });

export function createLotusCandle(seed = 1) {
  const R = rng(seed * 7 + 1);
  const group = new THREE.Group();
  const petals = [];
  for (const [n, len, wid, open, rot] of [[8, 0.16, 0.1, 1.15, 0], [8, 0.13, 0.085, 0.7, 0.4]]) {
    const p0 = paperPetal(len, wid);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rot;
      petals.push(p0.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(open, a, 0, 'YXZ'))).translate(Math.sin(a) * 0.03, 0.02, Math.cos(a) * 0.03));
    }
  }
  const flower = new THREE.Mesh(mergeGeometries(petals), petalPaper);
  flower.castShadow = true;
  group.add(flower);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x5f8a3a, roughness: 0.7 }));
  base.position.y = 0.005;
  group.add(base);
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 16), new THREE.MeshStandardMaterial({ color: 0xf6ead4, roughness: 0.5, emissive: 0xff9a40, emissiveIntensity: 0.1 }));
  wax.position.y = 0.055;
  group.add(wax);
  const flame = createFlame();
  flame.position.y = 0.09;
  group.add(flame);
  const halo = new THREE.Sprite(lanternHalo);
  halo.position.y = 0.12;
  halo.scale.setScalar(0.9);
  halo.raycast = () => {};
  group.add(halo);
  group.rotation.y = R() * Math.PI;
  group.userData.radius = 0.22;
  group.userData.material = 'water';
  group.userData.float = true;
  group.userData.drift = true;
  group.userData.lights = [{ offset: new THREE.Vector3(0, 0.12, 0), color: 0xff9a45, intensity: 1.6, distance: 4.5, flicker: true, day: 0.25 }];
  return group;
}

// ---------------------------------------------------------------------------
// Pedra no lago: a maior parte fica submersa, o topo com musgo aflora
// ---------------------------------------------------------------------------
export function createWaterRock(seed = 1, { size } = {}) {
  const R = rng(seed * 3 + 2);
  const sz = size ?? 0.5 + R() * 0.6;
  const g = createRock(seed, { size: sz, moss: 0.85, rough: 0.45, sy: 0.55 + R() * 0.3 });
  g.children[0].position.y -= sz * 0.35; // afunda: o lago esconde a base
  g.userData.radius = sz * 1.1;
  return g;
}

// ---------------------------------------------------------------------------
// Yukimi-dōrō: lanterna de pedra de lago, de pernas curvas e chapéu largo
// ---------------------------------------------------------------------------
export function createYukimi(seed = 1) {
  const kit = getKit();
  const R = rng(seed * 11 + 5);
  const group = new THREE.Group();
  const mat = kit.stoneFine;
  const add = (geo, y = 0, flat = true) => {
    if (flat) { geo = geo.toNonIndexed(); geo.computeVertexNormals(); }
    paintGeometry(geo, 0x8a867d, (c, x, yy, z) => c.multiplyScalar(0.85 + Math.sin(x * 9 + z * 7 + yy * 5) * 0.08));
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  // três pernas curvas, abrindo para fora, entrando na água
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 0.48, -0.4, Math.sin(a) * 0.48),
      new THREE.Vector3(Math.cos(a) * 0.38, 0.2, Math.sin(a) * 0.38),
      new THREE.Vector3(Math.cos(a) * 0.22, 0.5, Math.sin(a) * 0.22),
    ]);
    add(new THREE.TubeGeometry(curve, 10, 0.06, 8), 0, false);
  }
  const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  add(lathe([[0, 0], [0.32, 0], [0.34, 0.06], [0.3, 0.1], [0, 0.1]], 6), 0.5);
  // caixa de luz hexagonal com janelas acesas
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 6), 0.62);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const post = add(new THREE.BoxGeometry(0.05, 0.24, 0.05), 0.76);
    post.position.x = Math.sin(a) * 0.19;
    post.position.z = Math.cos(a) * 0.19;
  }
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 6), lanternGlow);
  core.position.y = 0.76;
  group.add(core);
  // chapéu muito largo e baixo (o "chapéu de neve")
  const roof = add(lathe([[0, 0.24], [0.12, 0.22], [0.36, 0.11], [0.6, 0.03], [0.66, 0.05], [0.66, 0.0], [0.56, -0.04], [0, -0.04]], 6), 0.92);
  roof.rotation.y = Math.PI / 6;
  add(lathe([[0, 0], [0.06, 0], [0.08, 0.04], [0.05, 0.09], [0.07, 0.13], [0.02, 0.2], [0, 0.22]], 12), 0.92 + 0.22, false);
  bakeGroup(group);
  const halo = new THREE.Sprite(lanternHalo);
  halo.position.y = 0.76;
  halo.scale.setScalar(1.4);
  halo.raycast = () => {};
  group.add(halo);
  group.rotation.y = R() * Math.PI;
  group.userData.radius = 0.75;
  group.userData.material = 'stone';
  group.userData.lights = [{ offset: new THREE.Vector3(0, 0.76, 0), color: 0xffa24f, intensity: 4, distance: 8, flicker: true, day: 0 }];
  return group;
}
