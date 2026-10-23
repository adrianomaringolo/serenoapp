// Árvores e arbustos:
//  - bordo japonês (momiji): galhos recursivos em tubos afinando, copa larga e
//    milhares de folhas vermelhas/laranja em instâncias, algumas caindo.
//  - pinheiro podado (niwaki): tronco sinuoso com "nuvens" de folhagem.
//  - arbustos arredondados (o-karikomi), alguns com flores de azaleia.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise, rng, smoothstep } from '../core/noise.js';
import { applyWind, globalUniforms, leafDepthMaterial } from '../core/materials.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { getKit } from './kit.js';

globalUniforms.uLeafGlow = { value: 0.1 };

// Tubo que afina ao longo da curva (o TubeGeometry do three tem raio fixo).
export function taperedTube(curve, tubular, radial, r0, r1, flare = 0) {
  const frames = curve.computeFrenetFrames(tubular, false);
  const len = curve.getLength();
  const pos = [], nrm = [], uv = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, P);
    let r = r0 + (r1 - r0) * t;
    if (flare) r *= 1 + flare * Math.pow(1 - t, 8);
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2;
      const s = Math.sin(v), c = -Math.cos(v);
      N.set(0, 0, 0).addScaledVector(frames.normals[i], c).addScaledVector(frames.binormals[i], s).normalize();
      pos.push(P.x + r * N.x, P.y + r * N.y, P.z + r * N.z);
      nrm.push(N.x, N.y, N.z);
      uv.push(t * len * 0.8, j / radial);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function randomUnit(R) {
  const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a));
}

// Folhagem: blob irregular com cor mais clara no alto e escura embaixo.
export function foliageBlob(seed, rx, ry, rz, { detail = 2, colors = [0x2f4a22, 0x5d7d35], lump = 0.28, flowers = 0 } = {}) {
  const nz = createNoise(seed);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const disp = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // forma geral + tufos de folhas (o "cacho" de um arbusto podado)
    const tuft = Math.abs(nz.n3(v.x * 7 + 3, v.y * 7, v.z * 7));
    const d = 1 + nz.fbm3(v.x * 1.8, v.y * 1.8, v.z * 1.8, 3) * lump
      + (0.5 - tuft) * 0.09 + nz.n3(v.x * 16, v.y * 16, v.z * 16) * 0.025;
    disp[i] = tuft;
    v.multiplyScalar(d);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.4;
    pos.setXYZ(i, v.x * rx, v.y * ry, v.z * rz);
  }
  g.computeVertexNormals();
  const A = new THREE.Color(colors[0]), B = new THREE.Color(colors[1]);
  const F = new THREE.Color(0xd77a9a), F2 = new THREE.Color(0xf0b3c4);
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = nz.fbm3(x * 3 + 3, y * 3, z * 3, 3);
    c.copy(A).lerp(B, smoothstep(-ry, ry, y) * 0.7 + smoothstep(-0.3, 0.4, n) * 0.4);
    c.multiplyScalar(0.6 + 0.4 * smoothstep(-ry, ry * 0.3, y));
    c.multiplyScalar(0.62 + 0.5 * (1 - smoothstep(0.05, 0.5, disp[i]))); // frestas escuras
    if (flowers > 0) {
      const f = nz.n3(x * 26 + 1, y * 26, z * 26);
      if (f > 0.5 - flowers * 0.2 && y > -ry * 0.3) c.copy(F).lerp(F2, Math.random() * 0.6);
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ---------------------------------------------------------------------------
// Bordo japonês
// ---------------------------------------------------------------------------
export const SAKURA_COLORS = [0xf7c6d4, 0xf3b2c4, 0xfbd8e2, 0xeea3b8, 0xfde6ec, 0xf0bccb];
const MAPLE_COLORS = [0xb8261b, 0xcf3b1a, 0xe0561c, 0xc23020, 0xe8781e, 0x9e1f1a, 0xf09a2a, 0xd84a2a];

function leafMaterial(tex, wind) {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.62 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLeafGlow = globalUniforms.uLeafGlow;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLeafGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uLeafGlow;');
  };
  m.customProgramCacheKey = () => 'leaf';
  if (wind) applyWind(m, wind);
  return m;
}

export function createMaple(seed = 7, { scale = 1, colors = MAPLE_COLORS } = {}) {
  const kit = getKit();
  const R = rng(seed);
  const geos = [];
  const clusters = [];
  const up = new THREE.Vector3(0, 1, 0);

  function grow(p0, dir, len, r0, depth) {
    const pts = [p0.clone()];
    const p = p0.clone(), d = dir.clone();
    for (let k = 0; k < 3; k++) {
      d.addScaledVector(randomUnit(R), depth === 0 ? 0.18 : 0.32).addScaledVector(up, depth === 0 ? 0.05 : 0.1).normalize();
      p.addScaledVector(d, len / 3);
      pts.push(p.clone());
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const r1 = r0 * (depth === 0 ? 0.55 : 0.5);
    geos.push(taperedTube(curve, depth === 0 ? 18 : 8, depth < 2 ? 12 : 6, r0, r1, depth === 0 ? 0.9 : 0));
    if (depth >= 4) {
      clusters.push(p.clone());
      clusters.push(curve.getPointAt(0.5));
      return;
    }
    if (depth >= 3) clusters.push(curve.getPointAt(0.6));
    const n = depth === 0 ? 4 : 2 + (R() < 0.45 ? 1 : 0);
    for (let c = 0; c < n; c++) {
      const t = depth === 0 ? 0.62 + (c / n) * 0.38 : 0.45 + R() * 0.55;
      const start = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      // copa em guarda-chuva: filhos se abrem para fora e um pouco para cima
      const ang = (c / n) * Math.PI * 2 + R() * 0.8;
      const out = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      const cd = tan.clone().multiplyScalar(depth === 0 ? 0.6 : 0.8).addScaledVector(out, depth === 0 ? 0.9 : 0.55).add(randomUnit(R).multiplyScalar(0.25));
      cd.y = Math.max(cd.y, depth < 2 ? 0.25 : -0.05);
      cd.normalize();
      grow(start, cd, len * (0.6 + R() * 0.18), r1 * (1 - t * 0.35) * 1.05, depth + 1);
    }
  }
  grow(new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(0.18, 1, 0.08).normalize(), 2.1, 0.2, 0);

  const wood = new THREE.Mesh(mergeGeometries(geos), kit.barkMat);
  wood.castShadow = wood.receiveShadow = true;

  // folhas
  const wind = { mode: 'world', base: 1.2, height: 4, amp: 0.06, flutter: 0.012 };
  const mat = leafMaterial(kit.mapleLeaf, wind);
  const leafGeo = new THREE.PlaneGeometry(0.2, 0.2);
  leafGeo.translate(0, 0.06, 0);
  const per = 52;
  const count = clusters.length * per;
  const leaves = new THREE.InstancedMesh(leafGeo, mat, count);
  leaves.customDepthMaterial = leafDepthMaterial(kit.mapleLeaf, wind);
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pp = new THREE.Vector3();
  const col = new THREE.Color();
  let i = 0;
  for (const c of clusters) {
    const tone = R();
    for (let k = 0; k < per; k++) {
      const r = Math.cbrt(R()) * 0.72;
      const dirv = randomUnit(R);
      pp.copy(c).addScaledVector(dirv, r);
      pp.y = c.y + dirv.y * r * 0.5 + 0.08;
      e.set(-Math.PI / 2 + (R() - 0.5) * 1.3, R() * Math.PI * 2, (R() - 0.5) * 0.9, 'YXZ');
      q.setFromEuler(e);
      const sc = 0.75 + R() * 0.55;
      s.set(sc, sc, sc);
      m4.compose(pp, q, s);
      leaves.setMatrixAt(i, m4);
      col.setHex(colors[Math.floor((tone * 0.6 + R() * 0.4) * colors.length) % colors.length]);
      col.multiplyScalar(0.75 + R() * 0.35);
      leaves.setColorAt(i, col);
      i++;
    }
  }
  leaves.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.add(wood, leaves);
  group.scale.setScalar(scale);

  // folhas caindo
  const bounds = new THREE.Box3();
  clusters.forEach((c) => bounds.expandByPoint(c));
  const fallMat = leafMaterial(kit.mapleLeaf);
  const fallingCount = 36;
  const falling = new THREE.InstancedMesh(leafGeo, fallMat, fallingCount);
  falling.frustumCulled = false;
  falling.userData.keep = true; // animada a cada quadro: não entra no mergeInstanced
  falling.castShadow = true;
  const fl = [];
  for (let k = 0; k < fallingCount; k++) {
    col.setHex(colors[k % colors.length]);
    falling.setColorAt(k, col);
    fl.push({ p: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), phase: R() * 10, life: -R() * 25, ground: 0 });
  }
  const groundAt = { fn: () => 0 };
  function respawn(f) {
    f.p.set(
      THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, Math.random()),
      THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, Math.random()),
      THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, Math.random()),
    );
    f.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    f.spin.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3);
    f.life = 0;
    f.landed = 0;
  }
  const world = new THREE.Vector3();
  group.add(falling);
  function update(dt, t) {
    group.updateMatrixWorld();
    for (let k = 0; k < fallingCount; k++) {
      const f = fl[k];
      if (f.life < 0) {
        f.life += dt;
        m4.makeScale(0, 0, 0);
        falling.setMatrixAt(k, m4);
        if (f.life >= 0) respawn(f);
        continue;
      }
      f.life += dt;
      let sc = 1;
      if (!f.landed) {
        const k = dt / scale;
        f.p.y -= k * (0.35 + 0.1 * Math.sin(t * 2 + f.phase));
        f.p.x += k * (Math.sin(t * 1.3 + f.phase) * 0.5 + 0.12);
        f.p.z += k * Math.cos(t * 0.9 + f.phase) * 0.35;
        f.rot.x += f.spin.x * dt; f.rot.y += f.spin.y * dt; f.rot.z += f.spin.z * dt;
        world.copy(f.p).applyMatrix4(group.matrixWorld);
        const gy = groundAt.fn(world.x, world.z);
        if (world.y <= gy + 0.02) {
          f.landed = 0.001;
          f.p.y += (gy + 0.02 - world.y) / scale;
          f.rot.set(-Math.PI / 2, f.rot.y, 0);
        }
      } else {
        f.landed += dt;
        sc = 1 - smoothstep(6, 9, f.landed);
        if (f.landed > 9) f.life = -2 - Math.random() * 12;
      }
      q.setFromEuler(f.rot);
      s.setScalar(sc);
      m4.compose(f.p, q, s);
      falling.setMatrixAt(k, m4);
    }
    falling.instanceMatrix.needsUpdate = true;
  }

  return { group, update, groundAt, leaves };
}

// ---------------------------------------------------------------------------
// Pinheiro podado (niwaki)
// ---------------------------------------------------------------------------
export function createPine(seed = 3, { size = 1 } = {}) {
  const kit = getKit();
  const R = rng(seed * 3 + 11);
  const group = new THREE.Group();
  const h = 1.5 + R() * 0.4;
  const pts = [new THREE.Vector3(0, -0.05, 0)];
  for (let k = 1; k <= 4; k++) {
    pts.push(new THREE.Vector3(Math.sin(k * 1.7 + seed) * 0.22 * (k / 4), (h * k) / 4, Math.cos(k * 1.3 + seed) * 0.18 * (k / 4)));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geos = [taperedTube(curve, 16, 9, 0.09, 0.035, 0.7)];
  const pads = [];
  const top = curve.getPointAt(1);
  pads.push({ p: top.clone().add(new THREE.Vector3(0, 0.12, 0)), r: 0.42 });
  const nb = 4 + Math.floor(R() * 2);
  for (let i = 0; i < nb; i++) {
    const t = 0.35 + (i / nb) * 0.55;
    const s = curve.getPointAt(t);
    const ang = i * 2.4 + R() * 0.6;
    const len = (0.75 - t * 0.35) * (0.9 + R() * 0.3);
    const e = s.clone().add(new THREE.Vector3(Math.cos(ang) * len, 0.12 + R() * 0.1, Math.sin(ang) * len));
    const mid = s.clone().lerp(e, 0.5).add(new THREE.Vector3(0, -0.05, 0));
    geos.push(taperedTube(new THREE.CatmullRomCurve3([s, mid, e]), 6, 5, 0.035, 0.015));
    pads.push({ p: e.clone().add(new THREE.Vector3(0, 0.06, 0)), r: 0.28 + (1 - t) * 0.22 });
  }
  const trunk = new THREE.Mesh(mergeGeometries(geos), kit.barkMat);
  trunk.castShadow = trunk.receiveShadow = true;
  group.add(trunk);
  const padGeos = pads.map((pd, i) => {
    const g = foliageBlob(seed * 10 + i, pd.r * 1.25, pd.r * 0.5, pd.r * 1.1, { detail: 3, colors: [0x22381b, 0x587a32], lump: 0.3 });
    g.translate(pd.p.x, pd.p.y, pd.p.z);
    return g;
  });
  const foliage = new THREE.Mesh(mergeGeometries(padGeos), kit.foliage);
  foliage.castShadow = foliage.receiveShadow = true;
  group.add(foliage);
  group.scale.setScalar(size);
  group.userData.radius = 0.8 * size;
  group.userData.material = 'wood';
  return group;
}

// ---------------------------------------------------------------------------
// Arbusto arredondado (o-karikomi) / azaleia
// ---------------------------------------------------------------------------
// Flor de azaleia: funil de 5 lóbulos, garganta escura e pintinhas na pétala
// de cima. Cores neutras: o tom vem da cor de cada instância.
let flowerGeo = null;
function azaleaFlowerGeometry() {
  if (flowerGeo) return flowerGeo;
  const segs = 15;
  const pos = [0, -0.014, 0], col = [0.35, 0.3, 0.32], idx = [];
  const rings = [
    (a) => [0.011, -0.005],
    (a) => [0.022, 0.001],
    (a) => [0.034 * (0.7 + 0.3 * Math.pow(Math.abs(Math.cos(a * 2.5)), 0.6)), 0.007],
  ];
  rings.forEach((fn, ri) => {
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const [r, y] = fn(a);
      pos.push(Math.cos(a) * r, y + (ri === 2 ? Math.sin(a * 5) * 0.002 : 0), Math.sin(a) * r);
      const upper = Math.abs(a - Math.PI / 2) < 0.7;
      let v = [0.5, 0.82, 1][ri];
      if (ri === 1 && upper) v = 0.42; // pintinhas na pétala de cima
      col.push(v, v * (ri === 0 ? 0.9 : 1), v);
    }
  });
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let ri = 0; ri < 2; ri++) {
    for (let j = 0; j < segs; j++) {
      const a = 1 + ri * segs + j, b = 1 + ri * segs + ((j + 1) % segs);
      const c = a + segs, d = b + segs;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  flowerGeo = g;
  return g;
}

let shrubMats = null;
function getShrubMats(kit) {
  if (shrubMats) return shrubMats;
  shrubMats = {
    leaf: new THREE.MeshStandardMaterial({ map: kit.smallLeaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.38 }),
    flower: new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, emissive: 0x220010, emissiveIntensity: 0.4 }),
  };
  return shrubMats;
}

let SHRUB_LEAF = null;
const AZALEA = [0xe8508a, 0xf06a9a, 0xd8366f, 0xf4848a, 0xe0407a, 0xc85cc0, 0xf3eef2];

export function createShrub(seed = 5, { size = 1, flowers = 0 } = {}) {
  const kit = getKit();
  const mats = getShrubMats(kit);
  const R = rng(seed * 5 + 1);
  const parts = [];
  const n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const r = (0.55 + R() * 0.35) * (i === 0 ? 1 : 0.75);
    const g = foliageBlob(seed * 20 + i, r * 1.15, r * 0.75, r, {
      detail: 3, colors: [0x1c3215, 0x34501f], lump: 0.12,
    });
    const a = R() * Math.PI * 2, d = i === 0 ? 0 : 0.5 + R() * 0.3;
    g.translate(Math.cos(a) * d, r * 0.55, Math.sin(a) * d);
    parts.push(g);
  }
  const bodyGeo = mergeGeometries(parts);
  const body = new THREE.Mesh(bodyGeo, kit.foliage);
  body.castShadow = body.receiveShadow = true;
  const group = new THREE.Group();
  group.add(body);

  // superfície coberta de folhinhas: quebra o contorno liso do volume
  const sampler = new MeshSurfaceSampler(body).build();
  const p = new THREE.Vector3(), nrm = new THREE.Vector3(), q = new THREE.Quaternion(), tw = new THREE.Quaternion();
  const m4 = new THREE.Matrix4(), s = new THREE.Vector3(), col = new THREE.Color();
  const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
  const leafN = 2600;
  SHRUB_LEAF ??= new THREE.PlaneGeometry(0.055, 0.1).translate(0, 0.04, 0);
  const tan = new THREE.Vector3(), ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3(), basis = new THREE.Matrix4();
  const leaves = new THREE.InstancedMesh(SHRUB_LEAF, mats.leaf, leafN); // gira pelo talo: a folha sai da superfície
  leaves.receiveShadow = true;
  const leafTones = flowers ? [0x3e5f26, 0x4c6e2c, 0x35531f, 0x58792f] : [0x46692a, 0x587d33, 0x3c5c24, 0x67893a];
  for (let i = 0; i < leafN; i++) {
    sampler.sample(p, nrm);
    // folha em escama: sai da superfície ~40° e mostra a face para fora (e para a luz)
    tan.set(R() - 0.5, R() - 0.5, R() - 0.5).projectOnPlane(nrm).normalize();
    const lift = 0.45 + R() * 0.5;
    ay.copy(tan).multiplyScalar(Math.cos(lift)).addScaledVector(nrm, Math.sin(lift)).normalize();
    az.copy(nrm).addScaledVector(ay, -nrm.dot(ay)).normalize();
    ax.crossVectors(ay, az);
    q.setFromRotationMatrix(basis.makeBasis(ax, ay, az));
    p.addScaledVector(nrm, R() * 0.02);
    const sc = 0.8 + R() * 0.5;
    m4.compose(p, q, s.setScalar(sc));
    leaves.setMatrixAt(i, m4);
    col.setHex(leafTones[Math.floor(R() * leafTones.length)]).multiplyScalar(0.85 + R() * 0.3);
    // mais claro no alto, onde bate sol
    col.multiplyScalar(0.8 + 0.35 * smoothstep(-0.5, 1, nrm.y));
    leaves.setColorAt(i, col);
  }
  group.add(leaves);

  if (flowers > 0) {
    // branca é rara; o resto são rosas, magentas e corais
    const base = new THREE.Color(AZALEA[R() < 0.12 ? AZALEA.length - 1 : Math.floor(R() * (AZALEA.length - 1))]);
    const flN = Math.round(560 * flowers);
    const fl = new THREE.InstancedMesh(azaleaFlowerGeometry(), mats.flower, flN);
    fl.receiveShadow = true;
    let placed = 0;
    const c0 = new THREE.Vector3(), side = new THREE.Vector3();
    for (let tries = 0; placed < flN && tries < flN * 6; tries++) {
      sampler.sample(c0, nrm);
      if (nrm.y < -0.15) continue; // flores viradas para cima e para os lados
      nrm.y += 0.35;
      nrm.normalize();
      // cacho de 2–3 flores em volta da ponta do raminho
      const k = 2 + (R() < 0.5 ? 1 : 0);
      for (let f = 0; f < k && placed < flN; f++) {
        side.set(R() - 0.5, R() - 0.5, R() - 0.5).projectOnPlane(nrm).normalize();
        const dir = nrm.clone().addScaledVector(side, 0.55).normalize();
        q.setFromUnitVectors(Y, dir);
        tw.setFromAxisAngle(Y, R() * Math.PI * 2);
        q.multiply(tw);
        p.copy(c0).addScaledVector(nrm, 0.03).addScaledVector(side, 0.03);
        m4.compose(p, q, s.setScalar(1.25 + R() * 0.4));
        fl.setMatrixAt(placed, m4);
        fl.setColorAt(placed, col.copy(base).offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.08));
        placed++;
      }
    }
    fl.count = placed;
    group.add(fl);
  }

  group.scale.setScalar(size);
  group.userData.radius = size;
  group.userData.material = 'wood';
  return group;
}

// ---------------------------------------------------------------------------
// Cedro (sugi): tronco reto e alto, copa em cone de camadas escuras
// ---------------------------------------------------------------------------
export function createCedar(seed = 1, { size = 1 } = {}) {
  const kit = getKit();
  const R = rng(seed * 9 + 4);
  const h = 7 + R() * 4;
  const trunk = taperedTube(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.2, 0), new THREE.Vector3((R() - 0.5) * 0.2, h * 0.5, (R() - 0.5) * 0.2), new THREE.Vector3((R() - 0.5) * 0.3, h, (R() - 0.5) * 0.3),
  ]), 10, 8, 0.22, 0.05, 0.6);
  const group = new THREE.Group();
  const t = new THREE.Mesh(trunk, kit.barkMat);
  t.castShadow = true;
  group.add(t);
  const layers = [];
  // muitas camadas sobrepostas e desencontradas: um cone contínuo e irregular,
  // não uma pilha de pratos
  const n = 18 + Math.floor(R() * 6);
  const wide = 1.6 + R() * 0.7;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const y = h * (0.22 + f * 0.8);
    const r = (wide * Math.pow(1 - f, 0.85) + 0.25) * (0.8 + R() * 0.4);
    const g = foliageBlob(seed * 31 + i, r, r * 0.85, r * (0.8 + R() * 0.3), { detail: 2, colors: [0x18291a, 0x2f4a2a], lump: 0.45 });
    const a = R() * Math.PI * 2, off = r * 0.25 * R();
    g.translate(Math.cos(a) * off, y, Math.sin(a) * off);
    layers.push(g);
  }
  const fol = new THREE.Mesh(mergeGeometries(layers), kit.foliage);
  fol.castShadow = fol.receiveShadow = true;
  group.add(fol);
  group.scale.setScalar(size);
  return group;
}
