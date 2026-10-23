// Ambiente 2 — Lago de Lótus.
// Um lago grande e espelhado ao amanhecer. Do deck de madeira na margem, uma
// passarela em zigue-zague leva a um pavilhão sobre palafitas. Touceiras de
// lótus, libélulas, salgueiros pendendo sobre a água, cerejeiras e uma
// floresta na outra margem, tudo refletido no espelho do lago.
import * as THREE from 'three';
import { createNoise, rng, smoothstep, mix } from '../../core/noise.js';
import { createFireflies, createMist } from '../../core/atmosphere.js';
import { createMirrorWater } from '../../core/mirrorWater.js';
import { globalUniforms, bakeStatic, mergeInstanced } from '../../core/materials.js';
import { initKit } from '../../models/kit.js';
import { createRock } from '../../models/rock.js';
import { createLantern, lanternGlow, lanternHalo } from '../../models/lantern.js';
import { createCandles } from '../../models/candle.js';
import { createMaple, createPine, createShrub, createCedar, SAKURA_COLORS } from '../../models/trees.js';
import { createGrass } from '../../models/bamboo.js';
import { createLotus } from '../../models/water.js';
import { createDeck } from '../../models/structures.js';
import { createMountains } from '../../models/landscape.js';
import { createLotusField, createLotusClump } from '../../models/lotusField.js';
import { createLotusCandle, createWaterRock, createYukimi } from '../../models/waterlife.js';
import { createDucks } from '../../models/ducks.js';
import { createHeron } from '../../models/heron.js';
import { createWillow } from '../../models/willow.js';
import { createDragonflies } from '../../models/dragonfly.js';
import { createPavilion, createBoardwalk, redLanternGlow } from '../../models/pavilion.js';
import { createBoat, createFloatingLantern, paperGlow } from '../../models/boat.js';

const LAKE = { x: 0, z: -16 };
const WATER = 0;
const DECK = { x0: -3.5, x1: 3.5, z0: 7, z1: 10.5, height: 0.45 };
const PAV = { x: -10.2, z: -4.0, half: 2.3, floorY: 0.55 };
const WALK = [[-3.4, 8.2], [-6.2, 5.6], [-5.0, 2.6], [-8.6, 0.4], [-10.2, -1.6]];
const nz = createNoise(777);

// raio do lago em cada direção (elipse com margem irregular)
function lakeRadius(a) {
  const c = Math.cos(a) / 38, s = Math.sin(a) / 24;
  return (1 / Math.hypot(c, s)) * (1 + 0.06 * Math.sin(3 * a + 1) + 0.04 * Math.sin(5 * a + 2) + 0.025 * Math.sin(7 * a));
}
// distância normalizada à margem: < 1 dentro do lago
function lakeN(x, z) {
  const dx = x - LAKE.x, dz = z - LAKE.z;
  return Math.hypot(dx, dz) / lakeRadius(Math.atan2(dz, dx));
}
const shorePoint = (a, n) => {
  const r = lakeRadius(a) * n;
  return [LAKE.x + Math.cos(a) * r, LAKE.z + Math.sin(a) * r];
};
const inBox = (x, z, b, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
const inPavilion = (x, z, m = 0) => Math.abs(x - PAV.x) < PAV.half + m && Math.abs(z - PAV.z) < PAV.half + m;

export function heightAt(x, z) {
  const n = lakeN(x, z);
  let land = 0.22 + nz.fbm2(x * 0.06, z * 0.06, 4) * 0.5 * smoothstep(1.02, 1.3, n) + nz.fbm2(x * 0.3, z * 0.3, 2) * 0.05;
  // morros só do outro lado do lago: deste lado o terreno fica baixo e aberto
  land += smoothstep(1.2, 2.0, n) * smoothstep(-2, -22, z) * (5 + 12 * (nz.fbm2(x * 0.02 + 4, z * 0.02, 3) + 0.5));
  land += smoothstep(1.3, 2.2, n) * 1.5;
  const bank = smoothstep(0.9, 1.04, n);
  return mix(-1.5 - nz.fbm2(x * 0.05, z * 0.05, 2) * 0.4, land, bank);
}

function createTerrain(kit) {
  const size = 230, seg = 300;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -12);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const mud = new THREE.Color(0x2e2a20), wet = new THREE.Color(0x6a6650);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = lakeN(x, z);
    c.setRGB(1, 1, 1);
    c.lerp(wet, (1 - smoothstep(0.98, 1.08, n)) * 0.7);
    c.lerp(mud, 1 - smoothstep(0.9, 1.0, n));
    c.multiplyScalar(0.9 + nz.fbm2(x * 0.3 + 7, z * 0.3, 2) * 0.25);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const map = kit.ground.map.clone(), nm = kit.ground.normalMap.clone();
  for (const t of [map, nm]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(size / 5, size / 5);
    t.needsUpdate = true;
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, normalMap: nm, vertexColors: true, roughness: 0.97 }));
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Quase tudo vai na água; na margem, só pedra, lanterna e velas.
export const catalog = {
  flutuante: { label: 'Lanterna flutuante', short: 'Flutuante', surface: 'water', create: (s) => createFloatingLantern(s), sound: 'water' },
  velaLotus: { label: 'Vela de lótus', short: 'Vela', surface: 'water', create: (s) => createLotusCandle(s), sound: 'water' },
  touceira: { label: 'Lótus', short: 'Lótus', surface: 'water', create: (s) => createLotusClump(s), sound: 'water' },
  lotus: { label: 'Vitória-régia', short: 'Vitória', surface: 'water', create: (s) => createLotus(s), sound: 'water' },
  pedraAgua: { label: 'Pedra no lago', short: 'Rocha', surface: 'water', create: (s, o = {}) => createWaterRock(s, o), sound: 'stone' },
  yukimi: { label: 'Lanterna do lago', short: 'Tōrō', surface: 'water', create: (s) => createYukimi(s), sound: 'stone' },
  patos: { label: 'Patos-mandarim', short: 'Patos', surface: 'water', create: (s) => createDucks(s), sound: 'water' },
  garca: { label: 'Garça', short: 'Garça', surface: 'water', create: (s) => createHeron(s), sound: 'water' },
  barco: { label: 'Barco', short: 'Barco', surface: 'water', create: (s) => createBoat(s), sound: 'water' },
  pedra: { label: 'Pedra', short: 'Pedra', surface: 'ground', create: (s, o = {}) => createRock(s, { size: o.size ?? 0.35 + rng(s)() * 0.5, island: false }), sound: 'stone' },
  lanterna: { label: 'Lanterna', short: 'Lanterna', surface: 'ground', create: (s) => createLantern(s), sound: 'stone' },
  velas: { label: 'Velas', short: 'Velas', surface: 'ground', create: (s) => createCandles(s), sound: 'chime' },
};

const DEFAULT_ITEMS = [
  { type: 'lanterna', x: -5.6, z: 11.4, seed: 21, rot: 0.3 },
  { type: 'lanterna', x: 6.2, z: 11.0, seed: 22, rot: -0.4 },
  { type: 'velas', x: 2.6, z: 9.7, seed: 23 },
  { type: 'velas', x: -9.3, z: -3.2, seed: 24 },
  { type: 'flutuante', x: 2.4, z: 4.2, seed: 31 },
  { type: 'flutuante', x: -1.2, z: 2.0, seed: 32 },
  { type: 'flutuante', x: 5.5, z: 0.6, seed: 33 },
  { type: 'flutuante', x: -2.8, z: -2.6, seed: 34 },
  { type: 'barco', x: 5.8, z: 6.0, seed: 41, rot: 0.5 },
  { type: 'lotus', x: 3.6, z: 2.6, seed: 51 },
  { type: 'lotus', x: -1.8, z: 5.2, seed: 52 },
  { type: 'pedra', x: -4.3, z: 10.4, seed: 61, opts: { size: 0.55 } },
  { type: 'pedra', x: 4.6, z: 10.9, seed: 62, opts: { size: 0.4 } },
  { type: 'pedra', x: -7.6, z: 9.8, seed: 63, opts: { size: 0.7 } },
  { type: 'touceira', x: -1.2, z: 6.2, seed: 81 },
  { type: 'velaLotus', x: 1.0, z: 3.4, seed: 82 },
  { type: 'velaLotus', x: 4.2, z: 2.0, seed: 83 },
  { type: 'yukimi', x: 7.6, z: 3.6, seed: 84, rot: 0.3 },
  { type: 'pedraAgua', x: 12.5, z: 4.2, seed: 85, opts: { size: 0.9 } },
  { type: 'pedraAgua', x: 11.4, z: 4.9, seed: 86, opts: { size: 0.45 } },
  { type: 'patos', x: 0.5, z: -5, seed: 87, rot: 1.2 },
  { type: 'garca', x: -14.8, z: 4.2, seed: 88, rot: 2.4 },
];

export async function build({ engine, audio, tick }) {
  const { scene } = engine;
  const kit = initKit();
  await tick('texturas');

  scene.add(createTerrain(kit));
  const mountains = createMountains({ seed: 91, layers: [[130, 22, 0.4], [180, 38, 0.6], [250, 60, 0.78]] });
  scene.add(mountains.group);
  await tick('terreno');

  // água espelhada (o plano passa por baixo das margens; o terreno o esconde)
  const water = createMirrorWater({
    geometry: new THREE.PlaneGeometry(100, 72),
    renderer: engine.renderer,
    normalMap: kit.waterNormal.clone(),
    level: WATER,
    quality: engine.quality,
  });
  water.mesh.position.set(LAKE.x, WATER, LAKE.z);
  scene.add(water.mesh);
  engine.onResize((w, h) => water.resize(w, h));

  // deck, passarela e pavilhão
  const deck = createDeck({ ...DECK });
  scene.add(deck.group);
  const walk = createBoardwalk(WALK, { height: 0.38, waterY: WATER });
  scene.add(walk.group);
  const pav = createPavilion({ half: PAV.half, floorY: PAV.floorY, waterY: WATER });
  pav.group.position.set(PAV.x, 0, PAV.z);
  scene.add(pav.group);
  for (const l of pav.lights) engine.lightPool.add(l);
  await tick('jardim');

  // lótus
  const avoid = (x, z) => lakeN(x, z) > 0.93 || walk.contains(x, z, 0.5) || inPavilion(x, z, 0.6) || inBox(x, z, DECK, 0.6);
  const field = createLotusField({
    clusters: [
      { x: 11, z: -1, r: 6, n: 120 }, { x: 18, z: -11, r: 7, n: 130 }, { x: -6.5, z: 3.5, r: 3.5, n: 55 },
      { x: -20, z: -9, r: 6, n: 100 }, { x: -4, z: -27, r: 8, n: 100 }, { x: -14.5, z: -8.5, r: 4, n: 55 },
    ],
    level: WATER, avoid, quality: engine.quality,
  });
  scene.add(field.group);
  await tick('lago');

  // árvores nas margens
  const decor = new THREE.Group();
  scene.add(decor);
  const place = (obj, x, z, rot = 0) => { obj.position.set(x, heightAt(x, z) - 0.05, z); obj.rotation.y = rot; decor.add(obj); return obj; };
  place(createWillow(3, { size: 1.1 }), ...shorePoint(2.25, 1.06), 0.4);
  place(createWillow(5, { size: 1.0 }), ...shorePoint(0.8, 1.06), 2.1);
  place(createWillow(8, { size: 1.2, strands: 1500 }), ...shorePoint(-1.85, 1.06), 1.2);
  const sakuras = [];
  for (const [a, sc, seed] of [[-0.55, 1.5, 12], [-2.55, 1.35, 14], [-1.35, 1.2, 16]]) {
    const t = createMaple(seed, { scale: sc, colors: SAKURA_COLORS });
    place(t.group, ...shorePoint(a, 1.08), seed);
    t.groundAt.fn = (x, z) => Math.max(heightAt(x, z), WATER + 0.01);
    sakuras.push(t);
  }
  // floresta na outra margem: pinheiros e arbustos em silhueta
  const Rf = rng(404);
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI * (0.06 + 0.88 * (i / 25)) + (Rf() - 0.5) * 0.1;
    const n = 1.1 + Rf() * 0.25;
    // cedros altos ao fundo, pinheiros podados mais perto da água
    if (i % 3 === 1) place(createPine(900 + i, { size: 2.4 + Rf() * 1.4 }), ...shorePoint(a, 1.08 + Rf() * 0.08), Rf() * 6);
    else place(createCedar(930 + i, { size: 0.9 + Rf() * 0.5 }), ...shorePoint(a, n), Rf() * 6);
  }
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI * (0.05 + 0.9 * Rf());
    place(createShrub(950 + i, { size: 1.4 + Rf() * 1.1 }), ...shorePoint(a, 1.04 + Rf() * 0.12), Rf() * 6);
  }
  // pedras na margem de cá
  const Rr = rng(505);
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * (0.15 + 0.7 * Rr());
    const [x, z] = shorePoint(a, 0.99 + Rr() * 0.04);
    if (inBox(x, z, DECK, 1) || walk.contains(x, z, 1)) continue;
    const r = createRock(700 + i, { size: 0.3 + Rr() * 0.5, moss: 0.7, rough: 0.5, detail: 3 });
    r.position.set(x, Math.max(heightAt(x, z), WATER - 0.1) - 0.05, z);
    decor.add(r);
  }
  // decoração fixa (árvores, arbustos, pedras, deck, passarela, pavilhão): uma malha por material
  bakeStatic(decor);
  mergeInstanced(decor);
  for (const g of [deck.group, walk.group, pav.group]) bakeStatic(g);
  await tick('árvores');

  // juncos na beira d'água (com taboas) e grama na margem
  const Rg = rng(606);
  const reeds = [], grass = [], cattails = [];
  for (let tries = 0; tries < 60000 && (reeds.length < 1600 || grass.length < 3200); tries++) {
    const x = (Rg() - 0.5) * 90, z = LAKE.z + (Rg() - 0.5) * 66;
    const n = lakeN(x, z);
    if (inBox(x, z, DECK, 0.5) || walk.contains(x, z, 0.4) || inPavilion(x, z, 0.4)) continue;
    const clump = nz.fbm2(x * 0.12, z * 0.12, 2);
    if (n > 0.955 && n < 1.025 && clump > -0.05 && reeds.length < 1600 && !(Math.abs(x) < 5 && z > 4)) {
      reeds.push({ x, z, y: Math.max(heightAt(x, z), WATER - 0.05), s: 2.6 + Rg() * 1.2 });
      if (Rg() < 0.12) cattails.push(new THREE.Vector3(x, Math.max(heightAt(x, z), WATER) + 1.1 + Rg() * 0.5, z));
    } else if (n > 1.02 && n < 1.45 && grass.length < 3200 && Rg() < 0.35 + clump) {
      grass.push({ x, z, y: heightAt(x, z), s: 1, dry: 0.3 });
    }
  }
  scene.add(createGrass(reeds, { seed: 41 }), createGrass(grass, { seed: 42 }));
  if (cattails.length) {
    const head = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 7);
    const stalk = new THREE.CylinderGeometry(0.006, 0.008, 1, 4).translate(0, -0.5, 0);
    const heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 }), cattails.length);
    const stalks = new THREE.InstancedMesh(stalk, new THREE.MeshStandardMaterial({ color: 0x6f7a3a, roughness: 0.8 }), cattails.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    cattails.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler((Rg() - 0.5) * 0.12, 0, (Rg() - 0.5) * 0.12));
      heads.setMatrixAt(i, m4.compose(p, q, s.set(1, 1, 1)));
      stalks.setMatrixAt(i, m4.compose(p.clone().setY(p.y - 0.1), q, s.set(1, p.y - WATER, 1)));
    });
    heads.castShadow = true;
    scene.add(heads, stalks);
  }
  await tick('grama');

  // vida e atmosfera
  const dragonflies = createDragonflies({ count: 8, perches: field.perches, area: [-16, 20, -16, 6], level: WATER });
  scene.add(dragonflies.group);
  const fireflies = createFireflies({ count: 120, area: [-24, 24, -30, 12], yRange: [0.3, 2.4], heightAt: (x, z) => Math.max(heightAt(x, z), WATER) });
  scene.add(fireflies.points);
  const mist = createMist(kit.blob, { count: 28, area: [-36, 36, -38, 4], yRange: [0.1, 1.1], size: [11, 20], heightAt: () => WATER, seed: 31 });
  scene.add(mist.group);

  // -------------------------------------------------------------------------
  const tmp = new THREE.Vector3();
  function pickSurface(ray) {
    const hits = [];
    const plane = (y) => {
      if (Math.abs(ray.direction.y) < 1e-5) return null;
      const t = (y - ray.origin.y) / ray.direction.y;
      return t > 0 ? { t, p: ray.at(t, new THREE.Vector3()) } : null;
    };
    const hd = plane(DECK.height);
    if (hd && inBox(hd.p.x, hd.p.z, DECK)) hits.push({ ...hd, kind: 'deck' });
    const hp = plane(PAV.floorY);
    if (hp && inPavilion(hp.p.x, hp.p.z, -0.15)) hits.push({ ...hp, kind: 'deck' });
    const hb = plane(walk.height);
    if (hb && walk.contains(hb.p.x, hb.p.z)) hits.push({ ...hb, kind: 'deck' });
    const hw = plane(WATER);
    if (hw && heightAt(hw.p.x, hw.p.z) < WATER) hits.push({ ...hw, kind: 'water' });
    let prev = 0;
    for (let t = 0.5; t < 140; t += t < 30 ? 0.25 : 0.8) {
      ray.at(t, tmp);
      if (tmp.y < heightAt(tmp.x, tmp.z)) {
        let a = prev, b = t;
        for (let k = 0; k < 10; k++) { const m = (a + b) / 2; ray.at(m, tmp); if (tmp.y < heightAt(tmp.x, tmp.z)) b = m; else a = m; }
        const p = ray.at(b, new THREE.Vector3());
        if (p.y >= WATER) hits.push({ t: b, p, kind: 'ground' });
        break;
      }
      prev = t;
    }
    hits.sort((a, b) => a.t - b.t);
    return hits[0] || null;
  }

  function structureHeight(x, z) {
    if (inBox(x, z, DECK)) return DECK.height;
    if (inPavilion(x, z, -0.15)) return PAV.floorY;
    if (walk.contains(x, z)) return walk.height;
    return null;
  }
  function surfaceHeight(x, z, surface) {
    if (surface === 'water') return WATER + 0.01;
    return structureHeight(x, z) ?? Math.max(heightAt(x, z), WATER);
  }
  const freeWater = (x, z, m = 0.5) => lakeN(x, z) < 0.96 && !walk.contains(x, z, m) && !inPavilion(x, z, m + 0.3) && !inBox(x, z, DECK, m);
  function accepts(hit, def) {
    if (!hit) return false;
    if (def.surface === 'water') return hit.kind === 'water' && freeWater(hit.p.x, hit.p.z);
    if (hit.kind === 'water') return false;
    return Math.hypot(hit.p.x, hit.p.z - 2) < 30;
  }

  // -------------------------------------------------------------------------
  let items = null;
  const deep = new THREE.Color();
  const deepBase = new THREE.Color(0x0b2022);
  function applyTime(s) {
    mountains.apply(s);
    lanternGlow.emissiveIntensity = 0.25 + s.lantern * 3.2;
    lanternHalo.opacity = s.lantern * 0.55;
    paperGlow.emissiveIntensity = 0.35 + s.lantern * 2.2;
    redLanternGlow.emissiveIntensity = 0.3 + s.lantern * 2.4;
    fireflies.uniforms.uIntensity.value = s.fireflies;
    globalUniforms.uLeafGlow.value = s.leafGlow;
    engine.lightPool.factor = s.lantern;
    audio.setEnvironment({ birds: s.birds, crickets: s.crickets });
    water.setDeep(deep.copy(deepBase).lerp(s.fogColor, 0.15).multiplyScalar(0.55 + s.hemiIntensity * 0.7));
  }

  let nextFish = 4;
  const mistColor = new THREE.Color();
  function update(dt, t) {
    water.update(dt);
    dragonflies.update(dt, t);
    for (const s of sakuras) s.update(dt, t);
    const cur = engine.timeOfDay.current;
    mist.update(dt, t, engine.camera, cur.mist * 0.8, mistColor.copy(cur.fogColor).lerp(new THREE.Color(1, 1, 1), 0.35));

    // peixes que pulam em algum canto do lago: só o anel na água e o "plop"
    nextFish -= dt;
    if (nextFish <= 0) {
      nextFish = 5 + Math.random() * 10;
      for (let k = 0; k < 10; k++) {
        const x = LAKE.x + (Math.random() - 0.5) * 50, z = LAKE.z + (Math.random() - 0.5) * 30;
        if (freeWater(x, z, 1) && Math.hypot(x - engine.camera.position.x, z - engine.camera.position.z) < 35) {
          water.ripple(x, z, 0.6);
          audio.plip(0.45);
          break;
        }
      }
    }

    // lanternas flutuantes derivam devagar, girando em volta do centro do lago
    if (items) {
      for (const it of items.items) {
        if (!it.object.userData.drift || it.removing || it.lift > 0) continue;
        const dx = it.target.x - LAKE.x, dz = it.target.z - LAKE.z;
        const l = Math.hypot(dx, dz) || 1;
        let vx = (-dz / l) * 0.05 + Math.sin(t * 0.13 + it.id) * 0.02;
        let vz = (dx / l) * 0.05 + Math.cos(t * 0.11 + it.id * 2) * 0.02;
        const nx = it.target.x + vx * dt, nz2 = it.target.z + vz * dt;
        if (freeWater(nx, nz2, 0.7)) {
          it.target.x = nx; it.target.z = nz2;
        } else {
          // encostou em algo: empurra de volta para o meio do lago
          it.target.x -= (dx / l) * 0.08 * dt;
          it.target.z -= (dz / l) * 0.08 * dt;
        }
        it.targetRot += dt * 0.05;
      }
      // patos: nadam devagar, mudando de rumo aos poucos e desviando de tudo
      for (const it of items.items) {
        if (!it.object.userData.swim || it.removing || it.lift > 0) continue;
        it.heading ??= it.targetRot;
        it.heading += (Math.sin(t * 0.17 + it.id * 3) * 0.25) * dt;
        const ahead = (d) => [it.target.x + Math.sin(it.heading) * d, it.target.z + Math.cos(it.heading) * d];
        if (!freeWater(...ahead(1.5), 0.8)) {
          // vira para o lado do centro do lago
          const want = Math.atan2(LAKE.x - it.target.x, LAKE.z - it.target.z);
          const diff = Math.atan2(Math.sin(want - it.heading), Math.cos(want - it.heading));
          it.heading += Math.sign(diff) * dt * 0.9;
        }
        const ud = it.object.userData;
        const [nx, nz2] = ahead((ud.swimSpeed ?? 0.16) * dt);
        if (freeWater(nx, nz2, 0.6)) { it.target.x = nx; it.target.z = nz2; }
        it.targetRot = it.heading;
        if (ud.splash) {
          water.ripple(ud.splash.x, ud.splash.z, ud.splash.s ?? 0.4);
          if ((ud.splash.s ?? 0) > 0.3) audio.plip(0.35);
          ud.splash = null;
        }
      }
      // garça: ela decide quando andar e virar; aqui só se aplica onde há água livre
      for (const it of items.items) {
        const ud = it.object.userData;
        if (!ud.walker || it.removing || it.lift > 0) continue;
        it.heading ??= it.targetRot;
        it.heading += (ud.turn || 0) * dt;
        const v = ud.moveSpeed || 0;
        if (v > 0) {
          const nx = it.target.x + Math.sin(it.heading) * v * dt, nz2 = it.target.z + Math.cos(it.heading) * v * dt;
          const lookX = it.target.x + Math.sin(it.heading) * 0.8, lookZ = it.target.z + Math.cos(it.heading) * 0.8;
          ud.blocked = !freeWater(lookX, lookZ, 0.5);
          if (!ud.blocked) { it.target.x = nx; it.target.z = nz2; }
        }
        it.targetRot = it.heading;
        if (ud.splash) {
          water.ripple(ud.splash.x, ud.splash.z, 0.8);
          audio.plip(0.7);
          ud.splash = null;
        }
      }
    }
    const gust = audio.gust ?? 0.25;
    globalUniforms.uWind.value += ((0.5 + gust * 1.6) - globalUniforms.uWind.value) * Math.min(1, dt * 0.5);
  }

  engine.controls.maxDistance = 22;

  return {
    id: 'lago-lotus',
    name: 'Lago de Lótus',
    catalog: { ...catalog },
    defaultItems: DEFAULT_ITEMS.map((d) => ({ ...d })),
    pickSurface,
    surfaceHeight,
    accepts,
    applyTime,
    update,
    attachItems: (m) => { items = m; },
    // bichos e barcos são os mais caros (animação, várias peças, reflexo)
    limits: { total: 40, perType: { patos: 4, garca: 3, barco: 3 } },
    // onde se pode pisar ao caminhar: margens, deck, passarela e pavilhão (água, não)
    standAt: (x, z) => {
      if (inBox(x, z, DECK)) return { y: DECK.height, kind: 'wood' };
      if (inPavilion(x, z, -0.15)) return { y: PAV.floorY, kind: 'wood' };
      if (walk.contains(x, z)) return { y: walk.height, kind: 'wood' };
      if (heightAt(x, z) < WATER + 0.12) return null; // nem a beirinha rasa
      if (Math.hypot(x, z + 12) > 46) return null;
      return { y: heightAt(x, z), kind: 'grass' };
    },
    walkStart: { x: 0, z: 9, yaw: 0 },
    viewpoints: [
      { name: 'Deck (vista inicial)', position: new THREE.Vector3(1.5, 3.8, 16), target: new THREE.Vector3(-1, 1.2, -4) },
      { name: 'Pavilhão', position: new THREE.Vector3(-6.4, 3.2, 3.6), target: new THREE.Vector3(-10.2, 1.3, -4) },
      { name: 'Entre as lótus', position: new THREE.Vector3(8, 2.4, 5.5), target: new THREE.Vector3(12, 0.5, -1) },
      { name: 'Salgueiro', position: new THREE.Vector3(12.5, 3, 8), target: new THREE.Vector3(19, 2.2, 4.5) },
      { name: 'Outra margem', position: new THREE.Vector3(3, 5, -31), target: new THREE.Vector3(-1, 1, -14) },
      { name: 'Lago, do alto', position: new THREE.Vector3(0, 16, 4), target: new THREE.Vector3(-2, 0, -10) },
    ],
    clickables: [],
    onWaterClick: (p) => { water.ripple(p.x, p.z, 1); audio.plip(); },
    mood: {
      root: 'F', scale: [0, 2, 4, 7, 9],
      chords: [[0, 7, 14, 16], [-3, 4, 9, 12], [2, 9, 14, 16], [-5, 2, 7, 14], [0, 4, 9, 14]],
    },
    camera: { position: new THREE.Vector3(1.5, 3.8, 16), target: new THREE.Vector3(-1, 1.2, -4) },
  };
}

export default {
  id: 'lago-lotus',
  name: 'Lago de Lótus',
  description: 'Lago espelhado ao amanhecer, pavilhão, lótus e libélulas.',
  defaultTime: 'amanhecer',
  build,
};
