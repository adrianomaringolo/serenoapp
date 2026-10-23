// Bambuzal (colmos com nós, folhas em lança) e grama em tufos, tudo em
// instâncias e balançando ao vento na GPU.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, smoothstep } from '../core/noise.js';
import { applyWind, leafDepthMaterial, paintGeometry } from '../core/materials.js';
import { getKit } from './kit.js';
import { bambooCulmTexture } from '../core/textures.js';

// Colmo de altura 1 (escalado por instância), com anéis de nó levemente salientes.
export function culmGeometry({ nodes = 11, radius = 0.06, colors = [0x56782c, 0x8ea545], old = false } = {}) {
  const g = new THREE.CylinderGeometry(radius * 0.8, radius, 1, 8, nodes * 3, false);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const f = (y * nodes) % 1;
    const bulge = Math.exp(-Math.pow((f < 0.5 ? f : 1 - f) * 14, 2)) * 0.18;
    pos.setX(i, pos.getX(i) * (1 + bulge));
    pos.setZ(i, pos.getZ(i) * (1 + bulge));
  }
  g.computeVertexNormals();
  const A = new THREE.Color(colors[0]), B = new THREE.Color(colors[1]);
  const node = new THREE.Color(old ? 0x8a7a4a : 0xc6c78a);
  paintGeometry(g, 0xffffff, (c, x, y) => {
    c.copy(A).lerp(B, smoothstep(0, 1, y));
    const f = (y * nodes) % 1;
    const d = Math.min(f, 1 - f);
    if (d < 0.02) c.lerp(node, 0.55);
    else if (d < 0.05) c.multiplyScalar(0.9);
    return c;
  });
  return g;
}

// ---------------------------------------------------------------------------
// Bambuzal
// ---------------------------------------------------------------------------

// Alturas normalizadas dos nós: entrenós curtos na base, longos no meio.
function nodeHeights(count = 15) {
  const w = [];
  for (let i = 0; i < count; i++) w.push(0.45 + Math.sin((i / (count - 1)) * Math.PI * 0.85) * 0.9);
  const total = w.reduce((a, b) => a + b, 0);
  const out = [];
  let acc = 0.02;
  for (const x of w) { acc += (x / total) * 0.95; out.push(acc); }
  return out.slice(0, -1);
}

// Colmo de altura 1 com anel saliente em cada nó, afinando e curvando no alto.
// A curva fica no plano x (cada instância gira o seu).
const CULM_R = 0.075;
const culmRadius = (y) => CULM_R * (1 - 0.4 * y);
const culmBend = (y, bend) => bend * Math.pow(y, 2.2);

function grovCulmGeometry(nodes, bend) {
  const pts = [[culmRadius(0) * 1.15, 0]];
  let last = 0;
  for (const n of nodes) {
    const mid = (last + n) / 2;
    pts.push([culmRadius(mid), mid]);
    const r = culmRadius(n);
    pts.push([r * 0.99, n - 0.006], [r * 1.13, n - 0.001], [r * 1.03, n + 0.003], [r, n + 0.008]);
    last = n;
  }
  pts.push([culmRadius(1), 1]);
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 8);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    uv.setY(i, y); // textura alinhada à altura (os nós do desenho batem com os da malha)
    pos.setX(i, pos.getX(i) + culmBend(y, bend));
  }
  g.computeVertexNormals();
  return g;
}

// Folha de bambu: talo na origem, ponta em -y, dobrada na nervura e caindo.
function bambooLeafGeometry(len = 0.28, wid = 0.042) {
  const g = new THREE.PlaneGeometry(wid, len, 2, 2);
  g.translate(0, -len / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const t = -y / len;
    pos.setZ(i, Math.abs(x) * 0.5 + t * t * 0.06);
  }
  g.computeVertexNormals();
  return g;
}

export function createBambooGrove(points, { heightRange = [6.5, 10], seed = 21, heightAt = null, quality = 'desktop' } = {}) {
  const kit = getKit();
  const R = rng(seed);
  const group = new THREE.Group();
  const nodes = nodeHeights();
  const culmTex = bambooCulmTexture(nodes);
  const wind = { mode: 'world', base: 0, height: 10, amp: 0.45, power: 1.8, flutter: 0 };

  // colmos: três variações de curvatura, cada uma uma InstancedMesh
  const culmMat = applyWind(new THREE.MeshStandardMaterial({ map: culmTex, roughness: 0.34, metalness: 0 }), wind);
  const culmDepth = applyWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), wind);
  const bends = [0.15, 0.45, 0.9];
  const byBend = bends.map(() => []);
  const culmData = points.map((pt) => {
    const k = Math.floor(R() * bends.length);
    const d = {
      p: new THREE.Vector3(pt.x, pt.y - 0.1, pt.z),
      h: THREE.MathUtils.lerp(heightRange[0], heightRange[1], R()),
      r: 0.75 + R() * 0.55,
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.08, R() * Math.PI * 2, (R() - 0.5) * 0.08)),
      bend: bends[k],
      tint: new THREE.Color().setHSL(0.2 + (R() - 0.5) * 0.06, 0.35, 0.8 + R() * 0.2),
    };
    byBend[k].push(d);
    return d;
  });
  const m4 = new THREE.Matrix4(), s = new THREE.Vector3();
  bends.forEach((b, k) => {
    const list = byBend[k];
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(grovCulmGeometry(nodes, b), culmMat, list.length);
    mesh.customDepthMaterial = culmDepth;
    mesh.castShadow = mesh.receiveShadow = true;
    list.forEach((d, i) => {
      m4.compose(d.p, d.q, s.set(d.r, d.h, d.r));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, d.tint);
    });
    group.add(mesh);
  });

  // ponto no eixo do colmo à altura normalizada t (segue a curvatura)
  const tmp = new THREE.Vector3();
  const culmPoint = (d, t, out) => out.set(culmBend(t, d.bend) * d.r, t * d.h, 0).applyQuaternion(d.q).add(d.p);

  // galhos e leques de folhas, só da metade de cima
  const branchSpecs = [];
  const sprays = [];
  for (const d of culmData) {
    let side = R() * Math.PI * 2;
    for (const n of nodes) {
      if (n < 0.42) continue;
      const count = R() < 0.45 ? 2 : 1;
      for (let c = 0; c < count; c++) {
        side += Math.PI + (R() - 0.5) * 0.9;
        const el = 0.5 + R() * 0.35 - (n - 0.42) * 0.3;
        const len = (0.55 + R() * 0.6) * (1.25 - n * 0.6);
        const dir = new THREE.Vector3(Math.cos(side) * Math.cos(el), Math.sin(el), Math.sin(side) * Math.cos(el));
        const base = culmPoint(d, n, new THREE.Vector3());
        branchSpecs.push({ base, dir, len });
        const nSprays = quality === 'mobile' ? 2 : 3 + (R() < 0.4 ? 1 : 0);
        for (let k = 0; k < nSprays; k++) {
          const f = 0.35 + (k / Math.max(nSprays - 1, 1)) * 0.65;
          const at = base.clone().addScaledVector(dir, len * f);
          at.y -= f * f * len * 0.25; // o galho pende com o peso das folhas
          sprays.push({ at, a: side + (R() - 0.5) * 0.6, n: 3 + Math.floor(R() * 4) });
        }
      }
    }
  }

  const branchGeo = new THREE.CylinderGeometry(0.006, 0.013, 1, 5, 1);
  branchGeo.translate(0, 0.5, 0);
  const branchMat = applyWind(new THREE.MeshStandardMaterial({ color: 0x6f7a3a, roughness: 0.6 }), wind);
  const branches = new THREE.InstancedMesh(branchGeo, branchMat, branchSpecs.length);
  branches.castShadow = true;
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  branchSpecs.forEach((b, i) => {
    q.setFromUnitVectors(up, b.dir);
    m4.compose(b.base, q, s.set(1, b.len, 1));
    branches.setMatrixAt(i, m4);
  });
  group.add(branches);

  const leafWind = { ...wind, flutter: 0.018 };
  const leafMat = applyWind(new THREE.MeshStandardMaterial({ map: kit.bambooLeaf, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.55 }), leafWind);
  const leafCount = sprays.reduce((a, x) => a + x.n, 0);
  const leaves = new THREE.InstancedMesh(bambooLeafGeometry(), leafMat, leafCount);
  leaves.customDepthMaterial = leafDepthMaterial(kit.bambooLeaf, leafWind);
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  const leafCols = [0x4d7a26, 0x5f8a2e, 0x3f6a22, 0x6e9636, 0x557f2a, 0x47702a];
  const qYaw = new THREE.Quaternion(), qPitch = new THREE.Quaternion(), qTwist = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
  const col = new THREE.Color();
  let li = 0;
  for (const sp of sprays) {
    for (let k = 0; k < sp.n; k++) {
      // leque: folhas se abrem para os lados e caem 20°–70° abaixo da horizontal
      const fan = sp.a + ((k / (sp.n - 1 || 1)) - 0.5) * 2.2 + (R() - 0.5) * 0.3;
      const droop = 0.35 + R() * 0.85;
      qYaw.setFromAxisAngle(Y, Math.atan2(-Math.cos(fan), -Math.sin(fan)));
      qPitch.setFromAxisAngle(X, Math.PI / 2 - droop);
      qTwist.setFromAxisAngle(Y, (R() - 0.5) * 1.4);
      q.copy(qYaw).multiply(qPitch).multiply(qTwist);
      tmp.copy(sp.at).add(new THREE.Vector3((R() - 0.5) * 0.04, (R() - 0.5) * 0.04, (R() - 0.5) * 0.04));
      const ls = 0.75 + R() * 0.5;
      m4.compose(tmp, q, s.set(ls, ls, ls));
      leaves.setMatrixAt(li, m4);
      const dry = R() < 0.04;
      col.setHex(dry ? 0xb8a85a : leafCols[Math.floor(R() * leafCols.length)]).multiplyScalar(0.85 + R() * 0.3);
      leaves.setColorAt(li, col);
      li++;
    }
  }
  group.add(leaves);

  // folhas secas no chão e alguns brotos (takenoko)
  if (heightAt) {
    const litterN = quality === 'mobile' ? 3000 : 7000;
    const litterGeo = new THREE.PlaneGeometry(0.045, 0.28);
    litterGeo.rotateX(-Math.PI / 2);
    const litter = new THREE.InstancedMesh(litterGeo, new THREE.MeshStandardMaterial({ map: kit.bambooLeaf, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }), litterN);
    litter.receiveShadow = true;
    const litterCols = [0x9a8250, 0x7d6a42, 0xb09a62, 0x6b5a3a, 0x8a8a4a];
    for (let i = 0; i < litterN; i++) {
      const d = culmData[Math.floor(R() * culmData.length)];
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 1.7;
      const x = d.p.x + Math.cos(a) * r, z = d.p.z + Math.sin(a) * r;
      q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.3, R() * Math.PI * 2, (R() - 0.5) * 0.3));
      m4.compose(tmp.set(x, heightAt(x, z) + 0.012, z), q, s.setScalar(0.8 + R() * 0.5));
      litter.setMatrixAt(i, m4);
      litter.setColorAt(i, col.setHex(litterCols[Math.floor(R() * litterCols.length)]).multiplyScalar(0.8 + R() * 0.3));
    }
    group.add(litter);

    const shootGeo = new THREE.ConeGeometry(0.07, 0.45, 9, 6);
    shootGeo.translate(0, 0.2, 0);
    paintGeometry(shootGeo, 0xffffff, (c, x, y) => {
      c.setHex(0x6b4a2e).lerp(new THREE.Color(0xa88a5a), smoothstep(-0.05, 0.42, y));
      if (Math.sin(y * 70) > 0.6) c.multiplyScalar(0.7); // bainhas sobrepostas
      return c;
    });
    const shoots = new THREE.InstancedMesh(shootGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 10);
    shoots.castShadow = true;
    for (let i = 0; i < 10; i++) {
      const d = culmData[Math.floor(R() * culmData.length)];
      const a = R() * Math.PI * 2, r = 0.5 + R() * 1.2;
      const x = d.p.x + Math.cos(a) * r, z = d.p.z + Math.sin(a) * r;
      q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.2, R() * 6, (R() - 0.5) * 0.2));
      m4.compose(tmp.set(x, heightAt(x, z) - 0.03, z), q, s.setScalar(0.6 + R() * 0.8));
      shoots.setMatrixAt(i, m4);
    }
    group.add(shoots);
  }
  return group;
}

// Tufo de grama: lâminas curvas afinando, cor escura na base e clara na ponta.
function tuftGeometry(seed, blades = 6) {
  const R = rng(seed);
  const parts = [];
  for (let b = 0; b < blades; b++) {
    const h = 0.25 + R() * 0.3;
    const w = 0.025 + R() * 0.015;
    const seg = 3;
    const g = new THREE.PlaneGeometry(w, h, 1, seg);
    g.translate(0, h / 2, 0);
    const pos = g.attributes.position;
    const bend = 0.08 + R() * 0.18;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = y / h;
      pos.setX(i, pos.getX(i) * (1 - t * 0.9));
      pos.setZ(i, bend * t * t);
    }
    g.rotateY(R() * Math.PI * 2);
    const a = R() * Math.PI * 2, d = R() * 0.08;
    g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    g.computeVertexNormals();
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  // normais apontando para cima: luz mais macia, sem lâminas pretas de costas
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i)).multiplyScalar(0.35);
    v.y += 1;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  const base = new THREE.Color(0x24391a), tipC = new THREE.Color(0x92a54c);
  paintGeometry(g, 0xffffff, (c, x, y) => c.copy(base).lerp(tipC, smoothstep(0, 0.5, y)));
  return g;
}

export function createGrass(points, { seed = 33 } = {}) {
  const R = rng(seed);
  const geo = tuftGeometry(seed);
  const mat = applyWind(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }), {
    mode: 'local', height: 0.5, amp: 0.09, power: 2, flutter: 0.004,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, points.length);
  mesh.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  points.forEach((pt, i) => {
    e.set((R() - 0.5) * 0.2, R() * Math.PI * 2, (R() - 0.5) * 0.2);
    q.setFromEuler(e);
    const sc = (pt.s ?? 1) * (0.6 + R() * 0.7);
    s.set(sc, sc * (0.8 + R() * 0.5), sc);
    p.set(pt.x, pt.y - 0.02, pt.z);
    m4.compose(p, q, s);
    mesh.setMatrixAt(i, m4);
    col.setHSL(0.2 + (R() - 0.5) * 0.06 + (pt.dry ?? 0) * 0.04, 0.6, 0.78 + R() * 0.3);
    mesh.setColorAt(i, col);
  });
  return mesh;
}
