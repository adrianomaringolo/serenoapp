// Ambiente 4 — Caminho das Cerejeiras.
// Primavera, hanami. Um canal estreito de paredes de pedra (como o Caminho do
// Filósofo, em Quioto) corre entre duas fileiras de cerejeiras velhas que se
// debruçam sobre a água e fecham um túnel de flores. Pétalas caem o tempo todo
// e boiam em jangadas que descem a correnteza. Uma ponte laqueada atravessa o
// canal até um torii, e degraus de pedra sobem a colina onde está a grande
// cerejeira-chorona. À noite, as bonbori acendem as flores por baixo (yozakura).
// Tocar uma cerejeira faz chover pétalas.
import * as THREE from 'three';
import { createNoise, rng, smoothstep } from '../../core/noise.js';
import { createMist } from '../../core/atmosphere.js';
import { createMirrorWater } from '../../core/mirrorWater.js';
import { globalUniforms, bakeStatic, mergeInstanced, paintGeometry } from '../../core/materials.js';
import { initKit } from '../../models/kit.js';
import { createRock, rockGeometry } from '../../models/rock.js';
import { createLantern, lanternGlow, lanternHalo } from '../../models/lantern.js';
import { createCandles } from '../../models/candle.js';
import { createShrub, createCedar } from '../../models/trees.js';
import { createGrass } from '../../models/bamboo.js';
import { createMountains } from '../../models/landscape.js';
import { createFloatingLantern, paperGlow } from '../../models/boat.js';
import { createPaperBoat } from '../../models/forest.js';
import {
  createSakura, createWeepingSakura, createPetalFall, createPetalRafts, sakuraKit, fillClumps, YOSHINO, YAE,
} from '../../models/sakura.js';
import { createBonbori, createTorii, createArchBridge, createMosen, createParasol } from '../../models/hanami.js';

const nz = createNoise(4141);

// --- o canal ---------------------------------------------------------------------
// Corre ao longo de z (a água desce na direção de quem olha, z crescente),
// serpenteando de leve. Paredes de pedra verticais; a margem fica a BANK acima
// da água. Os extremos ficam além da borda do terreno: o canal não acaba à vista.
const HW = 1.7, BANK = 0.9, BED = -0.75, WATER = 0;
const CAP = 0.6; // largura das lajes que arrematam a parede
const ZA = -125, ZB = 55; // de onde vem e para onde vai
const cx = (z) => 1.6 * Math.sin(z * 0.045 + 0.4) + 0.55 * Math.sin(z * 0.11 + 1.3);
const cxd = (z) => 1.6 * 0.045 * Math.cos(z * 0.045 + 0.4) + 0.55 * 0.11 * Math.cos(z * 0.11 + 1.3);
// distância lateral (com sinal: + é a margem leste, a da colina) ao eixo do canal
const lateral = (x, z) => (x - cx(z)) / Math.sqrt(1 + cxd(z) ** 2);
// o caminho de pedrisco na margem oeste
const PATH = { d0: -(HW + CAP), d1: -(HW + 2.9) };

// ponte, torii e a colina da cerejeira-chorona (do outro lado da ponte)
const ZBR = -3;
const HILL = { d: 21, z: -6, h: 3.4, r0: 4.8, r1: 13.5 };
const hillCenter = () => ({ x: cx(HILL.z) + HILL.d, z: HILL.z });

function heightAt(x, z) {
  const d = lateral(x, z), ad = Math.abs(d);
  if (ad < HW) return BED + nz.fbm2(x * 0.4, z * 0.4, 2) * 0.08;
  // a margem é plana perto do canal; mais longe o chão ondula e sobe devagar
  const far = smoothstep(HW + 4, HW + 12, ad);
  let h = BANK + nz.fbm2(x * 0.06, z * 0.06, 3) * 0.6 * far + nz.fbm2(x * 0.35, z * 0.35, 2) * 0.05 * smoothstep(HW + CAP, HW + 3, ad);
  // oeste: encosta que sobe para os cedros; leste: campo aberto até a colina
  if (d < 0) h += smoothstep(HW + 6, 45, ad) * (4 + 5 * (nz.fbm2(x * 0.02 + 3, z * 0.02, 3) + 0.5));
  else h += smoothstep(HW + 18, 70, ad) * (6 + 6 * (nz.fbm2(x * 0.02 + 8, z * 0.02, 3) + 0.5));
  // morros ao fundo, depois da curva do canal
  h += smoothstep(-40, -95, z) * smoothstep(HW + 3, HW + 16, ad) * (8 + 10 * (nz.fbm2(x * 0.025, z * 0.025 + 5, 3) + 0.5));
  const hc = hillCenter();
  const r = Math.hypot(x - hc.x, (z - hc.z) * 1.15);
  h += HILL.h * smoothstep(HILL.r1, HILL.r0, r) + nz.fbm2(x * 0.15, z * 0.15, 2) * 0.12 * smoothstep(HILL.r1 + 2, HILL.r1 - 3, r);
  return h;
}
// nível da água onde há água (no canal), -Infinity fora
const waterAt = (x, z) => (Math.abs(lateral(x, z)) < HW ? WATER : -Infinity);

// Terreno numa grade que segue o canal: colunas em d (com uma coluna dupla em
// ±HW, para a parede ser um degrau vertical de verdade) e linhas em z.
function createTerrain(kit, petalSpots) {
  const ds = [];
  const push = (v) => { if (!ds.length || v > ds[ds.length - 1] + 1e-4) ds.push(v); };
  for (let v = -110; v < -24; v += 1.2) push(v);
  for (let v = -24; v < -HW - 0.02; v += 0.35) push(v);
  push(-HW - 0.01); push(-HW + 0.01);
  for (let v = -HW + 0.4; v < HW - 0.2; v += 0.4) push(v);
  push(HW - 0.01); push(HW + 0.01);
  for (let v = HW + 0.35; v < 30; v += 0.35) push(v);
  for (let v = 30; v <= 110; v += 1.2) push(v);
  const zs = [];
  for (let z = -112; z <= 48; z += 0.45) zs.push(z);
  const nx = ds.length, nzz = zs.length;
  const pos = new Float32Array(nx * nzz * 3), uv = new Float32Array(nx * nzz * 2), col = new Float32Array(nx * nzz * 3);
  const c = new THREE.Color();
  const grass = new THREE.Color(0.98, 1.0, 0.74), path = new THREE.Color(1.55, 1.25, 0.92), dirt = new THREE.Color(1.1, 0.9, 0.7), bed = new THREE.Color(0.45, 0.45, 0.4);
  const hc = hillCenter();
  for (let j = 0; j < nzz; j++) {
    const z = zs[j], k = Math.sqrt(1 + cxd(z) ** 2);
    for (let i = 0; i < nx; i++) {
      const d = ds[i];
      // perpendicular ao eixo: desloca em x e um tiquinho em z
      const x = cx(z) + d / k, zz = z - (d * cxd(z)) / k;
      const n = j * nx + i;
      const y = Math.abs(d) < HW ? heightAt(cx(zz) + d * 0.5, zz) : heightAt(x, zz);
      pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = zz;
      uv[n * 2] = x / 5; uv[n * 2 + 1] = zz / 5;
      c.copy(grass);
      // terra batida nas bordas do caminho, pedrisco claro no meio
      if (d < 0) {
        const edge = smoothstep(PATH.d1 - 0.6, PATH.d1 + 0.3, d) * (1 - smoothstep(PATH.d0 - 0.2, PATH.d0 + 0.3, d));
        c.lerp(dirt, edge * 0.8);
        c.lerp(path, smoothstep(PATH.d1, PATH.d1 + 0.5, d) * (1 - smoothstep(PATH.d0 - 0.4, PATH.d0, d)));
      }
      // trilha até o torii e o chão gasto em volta da cerejeira-chorona
      const r = Math.hypot(x - hc.x, (zz - hc.z) * 1.15);
      c.lerp(dirt, (1 - smoothstep(2.2, 4.5, r)) * 0.6);
      if (d > HW && Math.abs(zz - ZBR) < 1.4 && d < HILL.d - HILL.r0) c.lerp(dirt, (1 - smoothstep(0.7, 1.4, Math.abs(zz - ZBR))) * 0.75);
      // sob as copas, o chão fica rosado de pétalas
      let pink = 0;
      for (const s of petalSpots) {
        const q = (x - s.x) ** 2 + (zz - s.z) ** 2;
        if (q < s.r * s.r) pink = Math.max(pink, 1 - q / (s.r * s.r));
      }
      pink *= 0.35 + 0.65 * smoothstep(-0.2, 0.3, nz.fbm2(x * 0.5, zz * 0.5, 2));
      c.lerp(new THREE.Color(2.0, 1.55, 1.65), pink * 0.55);
      if (Math.abs(d) < HW) c.copy(bed);
      c.multiplyScalar(0.9 + nz.fbm2(x * 0.3 + 7, zz * 0.3, 2) * 0.25);
      col[n * 3] = c.r; col[n * 3 + 1] = c.g; col[n * 3 + 2] = c.b;
    }
  }
  const idx = [];
  for (let j = 0; j < nzz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, cc = a + nx, dd = cc + 1;
      idx.push(a, cc, b, b, cc, dd);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const map = kit.ground.map.clone(), nm = kit.ground.normalMap.clone();
  for (const t of [map, nm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, normalMap: nm, vertexColors: true, roughness: 0.96 }));
  mesh.receiveShadow = true;
  return mesh;
}

// Paredes do canal: fiadas de blocos de pedra e, por cima, as lajes de arremate.
function createCanalWalls(kit) {
  const R = rng(77);
  const block = rockGeometry(5, { detail: 1, sx: 1, sy: 1, sz: 1, rough: 0.08, moss: 0 });
  block.computeBoundingBox();
  const bs = block.boundingBox.getSize(new THREE.Vector3());
  const slab = new THREE.BoxGeometry(1, 1, 1, 2, 1, 2);
  paintGeometry(slab, 0xffffff);
  const blocks = [], slabs = [];
  const rows = [[BED - 0.1, 0.5], [BED + 0.38, 0.46], [BED + 0.82, 0.42], [BED + 1.22, 0.4]];
  for (const side of [-1, 1]) {
    let z = -112;
    while (z < 46) {
      // laje de arremate
      const lw = 0.75 + R() * 0.5;
      slabs.push({ side, z: z + lw / 2, w: lw - 0.03, y: BANK + 0.04 + (R() - 0.5) * 0.02 });
      z += lw;
    }
    for (const [y0, h] of rows) {
      let zz = -112 + R();
      while (zz < 46) {
        const w = 0.45 + R() * 0.45;
        blocks.push({ side, z: zz + w / 2, w: w - 0.04, y: y0 + h / 2, h: h - 0.03 });
        zz += w;
      }
    }
  }
  const place = (side, z, dOff) => {
    const k = Math.sqrt(1 + cxd(z) ** 2);
    const d = side * (HW + dOff);
    return [cx(z) + d / k, z - (d * cxd(z)) / k, Math.atan(cxd(z))];
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const bi = new THREE.InstancedMesh(block, kit.stone, blocks.length);
  blocks.forEach((b, i) => {
    const [x, z, a] = place(b.side, b.z, 0.12);
    q.setFromEuler(e.set((R() - 0.5) * 0.05, a + (R() - 0.5) * 0.06, (R() - 0.5) * 0.05));
    bi.setMatrixAt(i, m4.compose(p.set(x, b.y, z), q, s.set(0.34 / bs.x, (b.h * 1.25) / bs.y, (b.w * 1.2) / bs.z)));
    // mais escuro e esverdeado perto da água
    const wet = 1 - smoothstep(WATER - 0.2, WATER + 0.5, b.y);
    col.setRGB(0.62, 0.6, 0.55).lerp(new THREE.Color(0.32, 0.36, 0.26), wet * 0.8).multiplyScalar(0.75 + R() * 0.4);
    bi.setColorAt(i, col);
  });
  bi.castShadow = bi.receiveShadow = true;
  const si = new THREE.InstancedMesh(slab, kit.stoneFine, slabs.length);
  slabs.forEach((b, i) => {
    const [x, z, a] = place(b.side, b.z, CAP / 2 - 0.05);
    q.setFromEuler(e.set(0, a + (R() - 0.5) * 0.02, 0));
    si.setMatrixAt(i, m4.compose(p.set(x, b.y, z), q, s.set(CAP + 0.06, 0.16, b.w)));
    si.setColorAt(i, col.setRGB(0.4, 0.39, 0.37).multiplyScalar(0.8 + R() * 0.3));
  });
  si.castShadow = si.receiveShadow = true;
  const g = new THREE.Group();
  g.add(bi, si);
  return g;
}

// Cerejeira distante: tufos grandes de flor sobre um tronquinho (nos morros do
// fundo). Os mesmos cachos das de perto, em escala maior e em menor número.
function farSakura(seed, size, sk) {
  const R = rng(seed);
  const tips = [];
  const n = 5 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, dd = i ? (1 + R() * 1.4) * size : 0;
    tips.push({ p: new THREE.Vector3(Math.cos(a) * dd, (3.2 + R() * 1.4) * size, Math.sin(a) * dd), r: (1.0 + R() * 0.5) * size });
  }
  const group = new THREE.Group();
  group.add(fillClumps(tips, 64, R, YOSHINO, { scale: 2.6 * size }));
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * size, 0.22 * size, 3.2 * size, 6).translate(0, 1.5 * size, 0), sk.bark);
  group.add(trunk);
  return group;
}

// ---------------------------------------------------------------------------
const muda = (s) => {
  const t = createSakura(s, { size: 0.36, density: 0.9 });
  t.group.userData.radius = 0.9;
  t.group.userData.material = 'wood';
  return t.group;
};
export const catalog = {
  bonbori: { label: 'Bonbori', short: 'Bonbori', surface: 'ground', create: (s) => createBonbori(s), sound: 'wood' },
  mosen: { label: 'Piquenique', short: 'Piquenique', surface: 'ground', create: (s) => createMosen(s), sound: 'wood' },
  guardaSol: { label: 'Guarda-sol', short: 'Guarda-sol', surface: 'ground', create: (s) => createParasol(s), sound: 'wood' },
  muda: { label: 'Cerejeira jovem', short: 'Cerejeira', surface: 'ground', create: muda, sound: 'wood' },
  lanterna: { label: 'Lanterna de pedra', short: 'Lanterna', surface: 'ground', create: (s) => createLantern(s), sound: 'stone' },
  velas: { label: 'Velas', short: 'Velas', surface: 'ground', create: (s) => createCandles(s), sound: 'chime' },
  pedra: { label: 'Pedra', short: 'Pedra', surface: 'ground', create: (s, o = {}) => createRock(s, { size: o.size ?? 0.3 + rng(s)() * 0.4, moss: 0.5 }), sound: 'stone' },
  flutuante: { label: 'Lanterna flutuante', short: 'Flutuante', surface: 'water', create: (s) => createFloatingLantern(s), sound: 'water' },
  barquinho: { label: 'Barquinho de papel', short: 'Barquinho', surface: 'water', create: (s) => createPaperBoat(s), sound: 'water' },
};

const C = (h) => new THREE.Color(h);
// Primavera: o céu tem a névoa leve do haru-gasumi; o amanhecer é rosado.
const PRESETS = {
  amanhecer: { horizon: C('#f3c6c2'), fogColor: C('#dcc6cc'), fogDensity: 0.012, hemiGround: C('#5a5540'), mountain: C('#6a6886') },
  dia: { horizon: C('#dbe4ee'), fogColor: C('#cfd8e4'), fogDensity: 0.0105, hemiGround: C('#5f6644'), mountain: C('#7488a4'), birds: 1 },
  entardecer: { fogColor: C('#d8a28c'), fogDensity: 0.0115 },
  // yozakura: as flores guardam um brilho rosado e as bonbori as acendem por baixo
  noite: { fogColor: C('#18203a'), fogDensity: 0.014, hemiIntensity: 0.5, exposure: 1.5, fireflies: 0, mist: 0.4, leafGlow: 0.06 },
};

export async function build({ engine, audio, tick }) {
  const { scene } = engine;
  const kit = initKit();
  const sk = sakuraKit();
  await tick('texturas');

  // --- onde ficam as cerejeiras (antes do terreno: o chão fica rosado embaixo) --
  const atD = (d, z) => { const k = Math.sqrt(1 + cxd(z) ** 2); return { x: cx(z) + d / k, z: z - (d * cxd(z)) / k }; };
  const Rt = rng(2026);
  const plan = [];
  // as duas fileiras, desencontradas, debruçadas sobre o canal
  for (let z = -78; z < 11; z += 7.2 + Rt() * 1.4) {
    if (Math.abs(z - ZBR) < 2.8) continue;
    plan.push({ ...atD(PATH.d1 - 0.9 - Rt() * 0.4, z), lean: 0, amt: 0.5 + Rt() * 0.2, size: 1.0 + Rt() * 0.22, trunk: 2.5 + Rt() * 0.5, rise: 1.05 });
  }
  for (let z = -74.5; z < 11; z += 7.2 + Rt() * 1.4) {
    if (Math.abs(z - ZBR) < 2.8) continue;
    plan.push({ ...atD(HW + CAP + 0.9 + Rt() * 0.3, z), lean: Math.PI, amt: 0.55 + Rt() * 0.2, size: 0.95 + Rt() * 0.2, trunk: 2.2 + Rt() * 0.5, rise: 0.95 });
  }
  // umas soltas no campo e no pé da colina
  for (const [d, z, s] of [[11, 8, 0.9], [9, -15, 1.0], [15, 14, 1.1], [27, -17, 0.95], [30, 4, 1.05], [-12, -20, 1.0], [-11, 12, 0.9]]) {
    plan.push({ ...atD(d, z), lean: null, amt: 0, size: s });
  }
  plan.forEach((p, i) => { p.tints = i % 4 === 3 ? YAE : YOSHINO; p.seed = 100 + i; });
  const hc = hillCenter();
  const petalSpots = plan.map((p) => ({ x: p.x + (p.lean === 0 ? 2 : p.lean ? -2 : 0), z: p.z, r: 5.5 * p.size }));
  petalSpots.push({ x: hc.x, z: hc.z, r: 7 });

  scene.add(createTerrain(kit, petalSpots));
  const mountains = createMountains({ seed: 63, layers: [[140, 26, 0.42], [190, 42, 0.6], [260, 62, 0.78]] });
  scene.add(mountains.group);
  await tick('terreno');

  // --- água, paredes, ponte, torii, degraus -----------------------------------
  const water = createMirrorWater({
    geometry: new THREE.PlaneGeometry(10, ZB - ZA),
    renderer: engine.renderer,
    normalMap: kit.waterNormal.clone(),
    level: WATER,
    quality: engine.quality,
  });
  water.mesh.position.set(0, WATER, (ZA + ZB) / 2);
  scene.add(water.mesh);
  engine.onResize((w, h) => water.resize(w, h));
  const decor = new THREE.Group();
  scene.add(decor);
  decor.add(createCanalWalls(kit));

  const bridge = (() => {
    const theta = Math.atan(cxd(ZBR));
    const b = createArchBridge({ span: 2 * (HW + CAP) + 0.5, width: 1.7, rise: 0.6 });
    const bx = cx(ZBR), bz = ZBR, y = BANK + 0.03;
    b.group.position.set(bx, y, bz);
    b.group.rotation.y = theta;
    decor.add(b.group);
    const c = Math.cos(theta), s = Math.sin(theta);
    const local = (x, z) => [(x - bx) * c - (z - bz) * s, (x - bx) * s + (z - bz) * c];
    return {
      y,
      contains(x, z, m = 0) { const [lx, lz] = local(x, z); return Math.abs(lx) < b.span / 2 + m && Math.abs(lz) < b.width / 2 + m; },
      deck(x, z) { return y + b.deckY(local(x, z)[0]); },
    };
  })();

  // torii no pé da colina, de frente para a ponte; degraus de pedra subindo
  const toriiAt = atD(HILL.d - HILL.r1 + 0.8, ZBR);
  const torii = createTorii();
  torii.position.set(toriiAt.x, heightAt(toriiAt.x, toriiAt.z) - 0.05, toriiAt.z);
  torii.rotation.y = Math.PI / 2 + Math.atan(cxd(ZBR));
  decor.add(torii);
  const steps = [];
  {
    // da base ao platô, em degraus de mesma altura
    const from = atD(HILL.d - HILL.r1 + 1.8, ZBR);
    const dir = new THREE.Vector2(hc.x - from.x, hc.z - from.z);
    const L = dir.length() - HILL.r0 + 0.6;
    dir.normalize();
    const h0 = heightAt(from.x, from.z), h1 = heightAt(from.x + dir.x * L, from.z + dir.y * L);
    const N = 16;
    const slabG = rockGeometry(9, { detail: 2, sx: 1, sy: 0.3, sz: 0.55, rough: 0.12, flat: -0.6, moss: 0.25 });
    slabG.computeBoundingBox();
    let t = 0;
    for (let k = 1; k <= N; k++) {
      const target = h0 + ((h1 - h0) * k) / N;
      let a = t, b = L;
      for (let it = 0; it < 24; it++) { const m = (a + b) / 2; if (heightAt(from.x + dir.x * m, from.z + dir.y * m) < target) a = m; else b = m; }
      t = a;
      const x = from.x + dir.x * t, z = from.z + dir.y * t;
      const m = new THREE.Mesh(slabG, kit.stone);
      m.scale.set(0.9, 0.8, 0.9);
      m.position.set(x, target + 0.04 - slabG.boundingBox.max.y * 0.8, z);
      m.rotation.y = -Math.atan2(dir.y, dir.x) + (k % 2 ? 0.04 : -0.04);
      m.castShadow = m.receiveShadow = true;
      decor.add(m);
      steps.push({ x, z, y: target + 0.04 });
    }
  }
  await tick('jardim');

  // --- cerejeiras ------------------------------------------------------------------
  const trees = [];
  for (const p of plan) {
    const t = createSakura(p.seed, { size: p.size, lean: p.lean, leanAmount: p.amt, tints: p.tints, trunk: p.trunk, rise: p.rise });
    const y = heightAt(p.x, p.z);
    t.group.position.set(p.x, y - 0.05, p.z);
    decor.add(t.group);
    trees.push({ ...p, y, tips: t.tips.map((tp) => ({ x: p.x + tp.p.x, y: y + tp.p.y, z: p.z + tp.p.z, r: tp.r })), proxy: t.group.children.find((o) => o.userData.keep) });
  }
  {
    const y = heightAt(hc.x, hc.z);
    const w = createWeepingSakura(7, { size: 1.15, strands: 1900, groundAt: (dx, dz) => heightAt(hc.x + dx, hc.z + dz) - y });
    w.group.position.set(hc.x, y - 0.1, hc.z);
    decor.add(w.group);
    trees.push({ x: hc.x, z: hc.z, y, weeping: true, tips: w.tips.map((tp) => ({ x: hc.x + tp.p.x, y: y + tp.p.y, z: hc.z + tp.p.z, r: tp.r })), proxy: w.group.children.find((o) => o.userData.keep) });
  }
  // bonbori fixas ao longo do caminho e na trilha do torii
  const bonbori = [];
  for (let z = -46; z < 24; z += 8) {
    const p = atD(PATH.d1 + 0.25, z + 2);
    bonbori.push(p);
  }
  for (const k of [0.3, 0.7]) {
    for (const side of [-1.1, 1.1]) {
      const a = atD(HW + CAP + 0.8, ZBR), b = toriiAt;
      bonbori.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k + side });
    }
  }
  for (const p of bonbori) {
    const g = createBonbori(Math.round(p.x * 13 + p.z * 7));
    g.position.set(p.x, heightAt(p.x, p.z), p.z);
    decor.add(g);
    // as do caminho iluminam as copas: luz mais forte e de mais alcance
    for (const l of g.userData.lights) engine.lightPool.add({ ...l, intensity: 5, distance: 13, object: g });
  }
  // azaleias, cedros e a encosta oeste; cerejeiras nos morros do fundo
  const Rs = rng(515);
  for (let i = 0; i < 16; i++) {
    const z = -50 + Rs() * 75;
    const p = atD(PATH.d1 - 2.2 - Rs() * 3, z);
    const s = createShrub(800 + i, { size: 0.6 + Rs() * 0.4, flowers: Rs() < 0.7 ? 0.5 : 0 });
    s.position.set(p.x, heightAt(p.x, p.z) - 0.05, p.z);
    decor.add(s);
  }
  for (let i = 0; i < 46; i++) {
    const west = i < 26;
    const p = west ? atD(-14 - Rs() * 26, -90 + Rs() * 120) : atD(36 + Rs() * 30, -80 + Rs() * 110);
    const c = createCedar(900 + i, { size: 0.85 + Rs() * 0.5 });
    c.position.set(p.x, heightAt(p.x, p.z) - 0.2, p.z);
    decor.add(c);
  }
  for (let i = 0; i < 40; i++) {
    const p = i < 20 ? atD((Rs() < 0.5 ? -1 : 1) * (12 + Rs() * 30), -60 - Rs() * 45) : atD((Rs() < 0.5 ? -1 : 1) * (20 + Rs() * 40), -30 + Rs() * 60);
    if (Math.hypot(p.x - hc.x, p.z - hc.z) < 12) continue;
    const g = farSakura(1200 + i, 0.8 + Rs() * 0.5, sk);
    g.position.set(p.x, heightAt(p.x, p.z) - 0.2, p.z);
    decor.add(g);
  }
  // pedras na beira da trilha e do platô
  for (let i = 0; i < 10; i++) {
    const a = Rs() * 6.28, r = HILL.r0 + Rs() * 1.5;
    const x = hc.x + Math.cos(a) * r, z = hc.z + Math.sin(a) * r / 1.15;
    if (steps.some((s) => Math.hypot(s.x - x, s.z - z) < 1.5)) continue;
    const rk = createRock(1600 + i, { size: 0.3 + Rs() * 0.4, moss: 0.6 });
    rk.position.set(x, heightAt(x, z) - 0.06, z);
    decor.add(rk);
  }
  bakeStatic(decor);
  mergeInstanced(decor);
  await tick('árvores');

  // --- chão: pedrisco, pétalas caídas, grama ----------------------------------------
  {
    // o caminho: uma faixa de pedrisco claro sobre o chão, de borda irregular
    const zs = [], dn = 9;
    for (let z = -112; z <= 48; z += 0.5) zs.push(z);
    const pos = [], uv = [], col = [], idx = [];
    zs.forEach((z, j) => {
      for (let i = 0; i <= dn; i++) {
        const u = i / dn;
        const wob = (i === 0 ? 1 : i === dn ? -1 : 0) * nz.fbm2(z * 0.4, i, 2) * 0.25;
        const d = PATH.d1 + 0.1 + u * (PATH.d0 - PATH.d1 - 0.05) + wob;
        const p = atD(d, z);
        pos.push(p.x, heightAt(p.x, p.z) + 0.018, p.z);
        uv.push(p.x / 3, p.z / 3);
        const edge = Math.min(u, 1 - u);
        const k = (0.62 + 0.38 * smoothstep(0, 0.25, edge)) * (0.92 + nz.fbm2(p.x * 0.6, p.z * 0.6, 2) * 0.2);
        col.push(k * 0.7, k * 0.64, k * 0.56);
        if (j && i) { const a = (j - 1) * (dn + 1) + i - 1, b = a + 1, c = a + dn + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const map = kit.sand.clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.needsUpdate = true;
    const path = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
    path.receiveShadow = true;
    scene.add(path);
  }
  {
    const pebble = rockGeometry(41, { detail: 0, sx: 1, sy: 0.55, sz: 0.85, rough: 0.2, moss: 0 });
    const R = rng(61);
    const list = [];
    for (let i = 0; i < 7000; i++) {
      const z = -60 + R() * 92, d = PATH.d1 + 0.1 + R() * (PATH.d0 - PATH.d1 - 0.15);
      const p = atD(d, z);
      list.push([p.x, heightAt(p.x, p.z), p.z, 0.025 + R() * 0.03, R() * 6]);
    }
    const inst = new THREE.InstancedMesh(pebble, kit.stoneFine, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color();
    list.forEach(([x, y, z, sc, r], i) => {
      q.setFromEuler(e.set(0, r, 0));
      inst.setMatrixAt(i, m4.compose(v.set(x, y + sc * 0.1, z), q, s.setScalar(sc)));
      inst.setColorAt(i, c.setRGB(0.78, 0.74, 0.68).multiplyScalar(0.75 + R() * 0.45));
    });
    inst.receiveShadow = true;
    scene.add(inst);
  }
  {
    // pétalas no chão: muitas sob as copas, algumas espalhadas
    const R = rng(71);
    const geo = new THREE.PlaneGeometry(0.045, 0.05).rotateX(-Math.PI / 2);
    const list = [];
    for (const s of petalSpots) {
      const n = Math.round(s.r * s.r * 9);
      for (let k = 0; k < n; k++) {
        const a = R() * 6.28, r = Math.sqrt(R()) * s.r;
        const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
        if (Math.abs(lateral(x, z)) < HW + 0.05) continue;
        list.push([x, z]);
      }
    }
    const mat = new THREE.MeshStandardMaterial({ map: sk.petalTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color();
    list.forEach(([x, z], i) => {
      const y = bridge.contains(x, z) ? bridge.deck(x, z) : heightAt(x, z);
      q.setFromEuler(e.set((R() - 0.5) * 0.4, R() * 6.28, (R() - 0.5) * 0.4));
      inst.setMatrixAt(i, m4.compose(v.set(x, y + 0.012, z), q, s.setScalar(0.8 + R() * 0.5)));
      inst.setColorAt(i, c.setHex(YOSHINO[i % 4]).multiplyScalar(0.82 + R() * 0.15));
    });
    inst.receiveShadow = true;
    scene.add(inst);
  }
  {
    const Rg = rng(606);
    const tufts = [];
    for (let tries = 0; tries < 50000 && tufts.length < 5200; tries++) {
      const x = cx(0) + (Rg() - 0.5) * 80, z = -60 + Rg() * 95;
      const d = lateral(x, z);
      if (Math.abs(d) < HW + CAP + 0.1 || (d < 0 && d > PATH.d1 - 0.3)) continue;
      if (steps.some((s) => Math.hypot(s.x - x, s.z - z) < 0.9) || Math.hypot(x - hc.x, (z - hc.z) * 1.15) < 2.6) continue;
      if (d > 0 && Math.abs(z - ZBR) < 1.1 && d < HILL.d - HILL.r0) continue;
      const clump = nz.fbm2(x * 0.15, z * 0.15, 2);
      if (Rg() > 0.45 + clump) continue;
      tufts.push({ x, z, y: heightAt(x, z), s: 0.9, dry: 0.1 });
    }
    scene.add(createGrass(tufts, { seed: 44 }));
  }
  await tick('grama');

  // --- pétalas no ar e na água, névoa ----------------------------------------------
  const sources = trees.flatMap((t) => t.tips);
  const flowAt = (x, z, out) => {
    const d = lateral(x, z);
    if (Math.abs(d) >= HW) { out.x = out.z = 0; return out; }
    const k = Math.sqrt(1 + cxd(z) ** 2), v = 0.13 * (1 - 0.6 * (d / HW) ** 2);
    out.x = (cxd(z) / k) * v; out.z = (1 / k) * v;
    return out;
  };
  const petals = createPetalFall({
    count: 1400, sources,
    groundAt: (x, z) => (bridge.contains(x, z) ? bridge.deck(x, z) : heightAt(x, z)),
    waterAt: (x, z) => (bridge.contains(x, z) ? -Infinity : waterAt(x, z)),
    flow: flowAt,
  });
  scene.add(petals.mesh);
  const RAFT = { z0: -80, len: 116 };
  const sampleCanal = (s) => {
    const z = RAFT.z0 + s, k = Math.sqrt(1 + cxd(z) ** 2);
    return { x: cx(z), z, dx: cxd(z) / k, dz: 1 / k, hw: HW - 0.12 };
  };
  const rafts = createPetalRafts({ count: 9000, length: RAFT.len, sample: sampleCanal, level: WATER, speed: 0.13 });
  scene.add(rafts.mesh);
  const mist = createMist(kit.blob, { count: 22, area: [-30, 34, -70, 20], yRange: [0.6, 2.2], size: [10, 18], heightAt, seed: 23 });
  scene.add(mist.group);

  engine.controls.maxDistance = 22;

  // ----------------------------------------------------------------------------------
  const tmp = new THREE.Vector3();
  function surfaceAt(x, z) {
    if (bridge.contains(x, z)) return { y: bridge.deck(x, z), kind: 'deck' };
    const g = heightAt(x, z), w = waterAt(x, z);
    return w > g ? { y: w, kind: 'water' } : { y: g, kind: 'ground' };
  }
  function pickSurface(ray) {
    let prev = 0;
    for (let t = 0.3; t < 150; t += t < 30 ? 0.2 : 0.8) {
      ray.at(t, tmp);
      if (tmp.y < surfaceAt(tmp.x, tmp.z).y) {
        let a = prev, b = t;
        for (let k = 0; k < 12; k++) { const m = (a + b) / 2; ray.at(m, tmp); if (tmp.y < surfaceAt(tmp.x, tmp.z).y) b = m; else a = m; }
        const p = ray.at(b, new THREE.Vector3());
        return { t: b, p, kind: surfaceAt(p.x, p.z).kind };
      }
      prev = t;
    }
    return null;
  }
  function surfaceHeight(x, z, surface) {
    if (surface === 'water') return WATER + 0.01;
    return bridge.contains(x, z) ? bridge.deck(x, z) : Math.max(heightAt(x, z), BANK - 0.2);
  }
  const freeWater = (x, z, m = 0.35) => Math.abs(lateral(x, z)) < HW - m && !bridge.contains(x, z, 0.4);
  function accepts(hit, def) {
    if (!hit) return false;
    if (def.surface === 'water') return hit.kind === 'water' && freeWater(hit.p.x, hit.p.z);
    if (hit.kind === 'water') return false;
    if (Math.abs(lateral(hit.p.x, hit.p.z)) < HW + 0.15 && hit.kind !== 'deck') return false;
    return Math.hypot(hit.p.x - 4, hit.p.z + 2) < 34;
  }

  // ----------------------------------------------------------------------------------
  let items = null;
  function applyTime(s) {
    mountains.apply(s);
    lanternGlow.emissiveIntensity = 0.25 + s.lantern * 3.2;
    lanternHalo.opacity = s.lantern * 0.55;
    paperGlow.emissiveIntensity = 0.3 + s.lantern * 2.4;
    globalUniforms.uLeafGlow.value = s.leafGlow;
    engine.lightPool.factor = s.lantern;
    audio.setEnvironment({ birds: s.birds, crickets: s.crickets * 0.6, water: 0.7 });
    water.setDeep(new THREE.Color(0x14211f).lerp(s.fogColor, 0.12).multiplyScalar(0.5 + s.hemiIntensity * 0.7));
  }

  // lanternas e barquinhos descem o canal; passando do trecho à vista, voltam lá
  // de cima (surgindo devagar)
  const DRIFT = { z0: -58, z1: 26 };
  const fl = { x: 0, z: 0 };
  function drift(dt, t) {
    for (const it of items.items) {
      if (!it.object.userData.drift || it.removing || it.lift > 0) continue;
      const x = it.target.x, z = it.target.z;
      flowAt(x, z, fl);
      const d = lateral(x, z);
      // puxa de leve para o meio e balança
      const vx = fl.x * 0.7 - d * 0.04 + Math.sin(t * 0.3 + it.id) * 0.015;
      const vz = fl.z * 0.7 + Math.cos(t * 0.27 + it.id) * 0.01;
      // (passam por baixo da ponte)
      let nx = x + vx * dt, nz2 = z + vz * dt;
      if (nz2 > DRIFT.z1) {
        nz2 = DRIFT.z0;
        nx = cx(nz2) + d * 0.5;
        it.object.position.set(nx, WATER, nz2);
        it.scale = 0.001;
      }
      if (Math.abs(lateral(nx, nz2)) < HW - 0.3) { it.target.x = nx; it.target.z = nz2; }
      else { it.target.x += (cx(z) - x) * dt * 0.3; }
      it.targetRot += dt * 0.04 * (it.id % 2 ? 1 : -1);
    }
  }

  let shake = 0;
  const mistColor = new THREE.Color(), white = new THREE.Color(1, 1, 1);
  function update(dt, t) {
    water.update(dt);
    rafts.update(dt);
    const gust = audio.gust ?? 0.25;
    shake = Math.max(0, shake - dt * 0.6);
    petals.update(dt, t, engine.camera, { rate: 34, wind: gust * 1.6 + shake, windDir: 0.9 });
    const cur = engine.timeOfDay.current;
    mist.update(dt, t, engine.camera, cur.mist * 0.6, mistColor.copy(cur.fogColor).lerp(white, 0.45));
    if (items) drift(dt, t);
    globalUniforms.uWind.value += ((0.45 + gust * 1.4 + shake * 1.5) - globalUniforms.uWind.value) * Math.min(1, dt * 0.6);
  }

  // sacudir uma cerejeira: chuva de pétalas, um farfalhar e um sininho
  const clickables = trees.filter((tr) => tr.proxy).map((tr) => ({
    object: tr.proxy,
    onClick: () => {
      petals.burst(tr.tips, tr.weeping ? 260 : 180);
      shake = Math.min(1, shake + 0.5);
      audio.rustle?.();
    },
  }));

  // --- jardim inicial e pontos de vista ---------------------------------------------
  const onCanal = (z, u = 0) => { const p = atD(u * HW, z); return { x: p.x, z: p.z }; };
  const DEFAULT_ITEMS = [
    { type: 'flutuante', ...onCanal(-6.5, 0.2), seed: 31 },
    { type: 'flutuante', ...onCanal(-14, -0.3), seed: 32 },
    { type: 'flutuante', ...onCanal(4, 0.35), seed: 33 },
    { type: 'barquinho', ...onCanal(-1.2, -0.25), seed: 34, rot: 0.6 },
    { type: 'barquinho', ...onCanal(-20, 0.1), seed: 35, rot: 1.9 },
    { type: 'mosen', ...atD(7.5, 3.5), seed: 41, rot: 0.4 },
    { type: 'guardaSol', ...atD(8.6, 4.6), seed: 42 },
    { type: 'lanterna', ...atD(HILL.d - HILL.r1 + 1.2, ZBR + 2.2), seed: 43, rot: 0.3 },
    { type: 'lanterna', ...atD(HILL.d - HILL.r1 + 1.2, ZBR - 2.2), seed: 44, rot: -0.3 },
    { type: 'velas', ...atD(HW + CAP + 0.5, ZBR + 1.6), seed: 45 },
    { type: 'muda', ...atD(13, -2.5), seed: 46 },
    { type: 'pedra', ...atD(7.2, 5.6), seed: 47, opts: { size: 0.35 } },
  ];

  const camera = {
    position: new THREE.Vector3(cx(30) - 1.2, BANK + 2.5, 30),
    target: new THREE.Vector3(cx(-6) + 0.3, BANK + 1.6, -6),
  };
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const pth = (z, h) => { const p = atD((PATH.d0 + PATH.d1) / 2, z); return v(p.x, BANK + h, p.z); };
  const viewpoints = [
    { name: 'Canal (vista inicial)', ...camera },
    { name: 'Túnel de flores', position: pth(12, 1.65), target: pth(-6, 2.1) },
    { name: 'Ponte', position: v(cx(ZBR), BANK + 0.6 + 1.5, ZBR + 0.1), target: v(cx(-24), BANK + 0.8, -24) },
    { name: 'Torii', position: (() => { const p = atD(1.4, ZBR); return v(p.x, BANK + 0.5 + 1.6, p.z); })(), target: v(hc.x, heightAt(hc.x, hc.z) + 2.6, hc.z) },
    { name: 'Cerejeira-chorona', position: v(hc.x - 9.5, heightAt(hc.x - 9.5, hc.z + 8) + 2.2, hc.z + 8), target: v(hc.x, heightAt(hc.x, hc.z) + 2.8, hc.z) },
    { name: 'O canal, do alto', position: v(cx(14) + 6, 14, 14), target: v(cx(-12), BANK, -12) },
  ];

  return {
    id: 'cerejeiras',
    name: 'Caminho das Cerejeiras',
    catalog: { ...catalog },
    defaultItems: DEFAULT_ITEMS.map((d) => ({ ...d })),
    pickSurface,
    surfaceHeight,
    accepts,
    applyTime,
    update,
    attachItems: (m) => { items = m; },
    limits: { total: 40, perType: { muda: 6, bonbori: 10, flutuante: 10, barquinho: 10, guardaSol: 4 } },
    // caminhar: margens, caminho, ponte e colina; no canal, não
    standAt: (x, z) => {
      if (bridge.contains(x, z, -0.15)) return { y: bridge.deck(x, z), kind: 'wood' };
      const d = lateral(x, z);
      if (Math.abs(d) < HW + 0.15) return null;
      if (Math.hypot(x - 4, z + 2) > 40) return null;
      if (Math.hypot(x - hc.x, z - hc.z) < 0.9) return null;
      for (const s of steps) if (Math.hypot(s.x - x, s.z - z) < 0.5) return { y: Math.max(s.y, heightAt(x, z)), kind: 'stone' };
      return { y: heightAt(x, z), kind: 'grass' };
    },
    walkStart: { x: pth(14, 0).x, z: 14, yaw: 0 },
    viewpoints,
    clickables,
    onWaterClick: (p) => { water.ripple(p.x, p.z, 1); audio.plip(); },
    // a escala de "Sakura Sakura" (miyako-bushi): lá, si bemol, ré, mi, fá
    mood: {
      root: 'A', scale: [0, 1, 5, 7, 8],
      chords: [[0, 7, 12, 17], [-4, 5, 8, 12], [-7, 0, 5, 8], [0, 7, 13, 17], [-5, 0, 5, 7]],
    },
    camera,
  };
}

export default {
  id: 'cerejeiras',
  name: 'Caminho das Cerejeiras',
  description: 'Canal sob um túnel de sakuras, pétalas na água, torii e lanternas.',
  defaultTime: 'dia',
  presets: PRESETS,
  build,
};
