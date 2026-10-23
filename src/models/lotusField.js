// Campo de lótus (Nelumbo): folhas grandes em forma de tigela erguidas em
// hastes, folhas deitadas na água, flores rosadas e brancas, botões e
// cápsulas de sementes. Tudo em instâncias, balançando de leve com o vento.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, smoothstep } from '../core/noise.js';
import { applyWind, paintGeometry, bakeGroup } from '../core/materials.js';

// Folha de raio 1: tigela rasa, umbigo no centro, nervuras claras e borda ondulada.
function leafGeometry() {
  const rings = 10, segs = 40;
  const pos = [], col = [], idx = [];
  const base = new THREE.Color(0x46713a), edge = new THREE.Color(0x6a9248), center = new THREE.Color(0xa3ae68), c = new THREE.Color();
  pos.push(0, 0.02, 0);
  col.push(center.r, center.g, center.b);
  for (let i = 1; i <= rings; i++) {
    const r = i / rings;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const wave = Math.sin(a * 9) * 0.035 * r * r * r + Math.sin(a * 3 + 1) * 0.05 * Math.pow(r, 5);
      const y = 0.2 * Math.pow(r, 1.7) + wave;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      const vein = Math.pow(Math.abs(Math.sin(a * 11)), 40) * (0.3 + 0.7 * r);
      c.copy(center).lerp(base, smoothstep(0.02, 0.25, r)).lerp(edge, smoothstep(0.5, 1, r) * 0.7);
      c.lerp(center, vein * 0.5);
      if (r === 1) c.multiplyScalar(0.8);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = 1 + i * segs + j, b = 1 + i * segs + ((j + 1) % segs);
      idx.push(a, b, a + segs, b, b + segs, a + segs);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Pétala em forma de canoa: larga no meio, ponta fina, côncava para dentro.
function petal(len, wid, cup, tip, baseCol, tipCol) {
  const g = new THREE.PlaneGeometry(wid, len, 4, 7);
  g.translate(0, len / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const t = Math.min(Math.max(y / len, 0), 0.999); // sem o clamp, -1e-17 vira NaN no pow
    const w = Math.pow(Math.sin(t * Math.PI), 0.75) * (1 - 0.25 * t);
    const nx = x * (0.25 + w * 1.15);
    pos.setXYZ(i, nx, y, -Math.pow(nx / wid, 2) * cup * 2 + t * t * tip);
  }
  g.computeVertexNormals();
  const A = new THREE.Color(baseCol), B = new THREE.Color(tipCol);
  paintGeometry(g, 0xffffff, (c, x, y) => {
    c.copy(A).lerp(B, smoothstep(0.25, 1, y / len));
    c.multiplyScalar(1 - Math.abs(x) / wid * 0.15); // nervura central levemente mais escura nas bordas
    return c;
  });
  return g;
}

function flowerGeometry(tipCol) {
  const parts = [];
  const rings = [
    [10, 0.17, 0.085, 1.05, 0.05],
    [8, 0.15, 0.075, 0.6, 0.03],
    [6, 0.12, 0.062, 0.28, 0.01],
  ];
  rings.forEach(([n, len, wid, open, tip], ri) => {
    const g0 = petal(len, wid, 0.045, tip, 0xfdf6f0, tipCol);
    for (let k = 0; k < n; k++) {
      const g = g0.clone();
      const a = (k / n) * Math.PI * 2 + ri * 0.35;
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(open + (Math.sin(k * 7.3) * 0.08), a, 0, 'YXZ')));
      g.translate(Math.sin(a) * 0.015, 0.01, Math.cos(a) * 0.015);
      parts.push(g);
    }
  });
  // receptáculo (a futura cápsula) e estames
  const pod = new THREE.CylinderGeometry(0.032, 0.022, 0.04, 14).translate(0, 0.035, 0);
  paintGeometry(pod, 0xe8cf4a, (c, x, y) => (y > 0.05 ? c.setHex(0xd9c24a) : c));
  parts.push(pod.toNonIndexed());
  const stamens = new THREE.CylinderGeometry(0.045, 0.04, 0.03, 18, 1, true).translate(0, 0.03, 0);
  paintGeometry(stamens, 0xf4d35a);
  parts.push(stamens.toNonIndexed());
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

function budGeometry() {
  const pts = [[0, 0], [0.025, 0.01], [0.048, 0.05], [0.05, 0.1], [0.038, 0.15], [0.018, 0.19], [0, 0.215]];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 14);
  const green = new THREE.Color(0x7d9a52), pink = new THREE.Color(0xe2789a), cream = new THREE.Color(0xf3e3d6);
  paintGeometry(g, 0xffffff, (c, x, y, z) => {
    const a = Math.atan2(z, x);
    c.copy(green).lerp(cream, smoothstep(0.02, 0.09, y)).lerp(pink, smoothstep(0.08, 0.2, y));
    c.multiplyScalar(0.88 + 0.12 * Math.abs(Math.cos(a * 2.5))); // sugere as pétalas fechadas
    return c;
  });
  return g;
}

function podGeometry() {
  const pts = [[0, 0], [0.018, 0.0], [0.045, 0.05], [0.062, 0.085], [0.06, 0.092], [0, 0.095]];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 16);
  paintGeometry(g, 0xffffff, (c, x, y, z) => {
    c.setHex(0x8f9a4a).lerp(new THREE.Color(0x6b6a3a), smoothstep(0.05, 0.09, y));
    // furinhos das sementes no topo
    if (y > 0.09 && Math.sin(x * 160) * Math.sin(z * 160) > 0.55) c.setHex(0x3e3a22);
    return c;
  });
  return g;
}

function stalkGeometry() {
  const g = new THREE.CylinderGeometry(0.01, 0.014, 1, 5, 1);
  g.translate(0, 0.5, 0);
  paintGeometry(g, 0x6f8a45, (c, x, y) => c.lerp(new THREE.Color(0x8a8a50), y * 0.4));
  return g;
}

/**
 * clusters: [{ x, z, r, n }] — n folhas por touceira
 * avoid(x, z): true onde não pode haver lótus (passarela, deck, pavilhão)
 * Devolve o grupo e os "poleiros" (topos de flores e botões, para as libélulas).
 */
// Geometrias e materiais compartilhados pelo campo e pelas touceiras avulsas.
let parts = null;
function lotusParts(level = 0) {
  if (parts) return parts;
  const wind = { mode: 'world', base: level, height: 1.4, amp: 0.05, power: 1.4, flutter: 0.004 };
  const mat = (opts) => applyWind(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, ...opts }), wind);
  const petalMat = mat({ roughness: 0.5, emissive: 0xff8fb0, emissiveIntensity: 0.05 });
  parts = {
    leaf: leafGeometry(), stalk: stalkGeometry(), pink: flowerGeometry(0xec6f97), white: flowerGeometry(0xf6eef0),
    bud: budGeometry(), pod: podGeometry(),
    leafMat: mat({ roughness: 0.55 }), stalkMat: mat({ roughness: 0.7 }), petalMat,
    budMat: mat({ roughness: 0.5 }), podMat: mat({ roughness: 0.7 }),
  };
  return parts;
}

// Touceira avulsa (item do catálogo): algumas folhas, uma flor, um botão.
export function createLotusClump(seed = 1) {
  const P = lotusParts();
  const R = rng(seed * 13 + 9);
  const group = new THREE.Group();
  const add = (geo, mat, x, z, h, sc, tilt = 0.3, flat = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, h, z);
    m.rotation.set((R() - 0.5) * tilt, R() * Math.PI * 2, (R() - 0.5) * tilt);
    m.scale.set(sc, flat ? sc * 0.15 : sc, sc);
    m.castShadow = !flat;
    m.receiveShadow = true;
    group.add(m);
    if (!flat) {
      const st = new THREE.Mesh(P.stalk, P.stalkMat);
      st.position.set(x, -0.5, z);
      st.scale.set(1, h + 0.5, 1);
      group.add(st);
    }
  };
  const nLeaves = 4 + Math.floor(R() * 3);
  for (let i = 0; i < nLeaves; i++) {
    const a = R() * Math.PI * 2, d = 0.15 + R() * 0.55;
    const flat = i < 2;
    add(P.leaf, P.leafMat, Math.cos(a) * d, Math.sin(a) * d, flat ? 0.012 : 0.15 + R() * 0.5, 0.28 + R() * 0.2, flat ? 0.04 : 0.45, flat);
  }
  add(R() < 0.2 ? P.white : P.pink, P.petalMat, (R() - 0.5) * 0.3, (R() - 0.5) * 0.3, 0.6 + R() * 0.4, 1 + R() * 0.3, 0.15);
  if (R() < 0.8) add(P.bud, P.budMat, (R() - 0.5) * 0.6, (R() - 0.5) * 0.6, 0.45 + R() * 0.4, 0.9 + R() * 0.3, 0.25);
  bakeGroup(group); // folhas, hastes e flores: uma chamada por material
  group.userData.radius = 0.8;
  group.userData.material = 'water';
  return group;
}

export function createLotusField({ clusters, level = 0, avoid = () => false, seed = 5, quality = 'desktop' }) {
  const R = rng(seed);
  const group = new THREE.Group();
  const P = lotusParts(level);

  const leaves = [], stalks = [], pink = [], white = [], buds = [], pods = [];
  const perches = [];
  const k = quality === 'mobile' ? 0.6 : 1;
  const spot = (c) => {
    for (let t = 0; t < 12; t++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * c.r;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d * 0.8;
      if (!avoid(x, z)) return { x, z };
    }
    return null;
  };
  const q = new THREE.Quaternion(), e = new THREE.Euler(), m4 = new THREE.Matrix4(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const head = (list, x, z, h, scale, tilt = 0.15) => {
    e.set((R() - 0.5) * tilt, R() * Math.PI * 2, (R() - 0.5) * tilt);
    q.setFromEuler(e);
    list.push(m4.compose(p.set(x, level + h, z), q, s.setScalar(scale)).clone());
    stalks.push(m4.compose(p.set(x, level - 0.5, z), q.identity(), s.set(1, h + 0.5, 1)).clone());
  };

  for (const c of clusters) {
    const n = Math.round(c.n * k);
    for (let i = 0; i < n; i++) {
      const at = spot(c);
      if (!at) continue;
      if (R() < 0.38) {
        // folha deitada na água
        e.set((R() - 0.5) * 0.04, R() * Math.PI * 2, (R() - 0.5) * 0.04);
        q.setFromEuler(e);
        const sc = 0.28 + R() * 0.22;
        leaves.push(m4.compose(p.set(at.x, level + 0.012, at.z), q, s.set(sc, sc * 0.15, sc)).clone());
      } else {
        head(leaves, at.x, at.z, 0.12 + Math.pow(R(), 1.8) * 0.65, 0.3 + R() * 0.28, 0.45);
      }
    }
    for (let i = 0; i < Math.round(n * 0.22); i++) {
      const at = spot(c);
      if (!at) continue;
      const h = 0.5 + R() * 0.55;
      head(R() < 0.16 ? white : pink, at.x, at.z, h, 0.9 + R() * 0.45);
      perches.push(new THREE.Vector3(at.x, level + h + 0.12, at.z));
    }
    for (let i = 0; i < Math.round(n * 0.14); i++) {
      const at = spot(c);
      if (!at) continue;
      const h = 0.45 + R() * 0.5;
      head(buds, at.x, at.z, h, 0.8 + R() * 0.5, 0.25);
      perches.push(new THREE.Vector3(at.x, level + h + 0.2, at.z));
    }
    for (let i = 0; i < Math.round(n * 0.05); i++) {
      const at = spot(c);
      if (at) head(pods, at.x, at.z, 0.6 + R() * 0.6, 0.9 + R() * 0.4, 0.5);
    }
  }

  const add = (geo, material, list, { cast = true } = {}) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const leafMesh = add(P.leaf, P.leafMat, leaves);
  // um pouco de variação de tom entre as folhas
  if (leafMesh) {
    const col = new THREE.Color();
    for (let i = 0; i < leaves.length; i++) leafMesh.setColorAt(i, col.setHSL(0.27 + (R() - 0.5) * 0.05, 0.25, 0.8 + R() * 0.25));
  }
  add(P.stalk, P.stalkMat, stalks, { cast: false });
  add(P.pink, P.petalMat, pink);
  add(P.white, P.petalMat, white);
  add(P.bud, P.budMat, buds);
  add(P.pod, P.podMat, pods);
  return { group, perches };
}
