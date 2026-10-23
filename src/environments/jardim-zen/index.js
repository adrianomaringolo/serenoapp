// Ambiente 1 — Jardim Zen.
// Um karesansui (jardim de areia rastelada com ilhas de pedra e musgo) diante
// de um deck de madeira; à esquerda um lago de carpas com shishi-odoshi; à
// direita um bordo japonês vermelho; ao fundo o bambuzal e montanhas na névoa.
import * as THREE from 'three';
import { createNoise, rng, smoothstep, mix } from '../../core/noise.js';
import { createSand } from '../../core/sand.js';
import { createFireflies, createMist } from '../../core/atmosphere.js';
import { initKit } from '../../models/kit.js';
import { createRock, createCairn, rockGeometry } from '../../models/rock.js';
import { createLantern, lanternGlow, lanternHalo } from '../../models/lantern.js';
import { createCandles } from '../../models/candle.js';
import { createMaple, createPine, createShrub } from '../../models/trees.js';
import { createBambooGrove, createGrass } from '../../models/bamboo.js';
import { createPond, createLotus } from '../../models/water.js';
import { createDeck, createCushion, createIncense, createCurbs, createShishiOdoshi } from '../../models/structures.js';
import { globalUniforms, bakeStatic, mergeInstanced } from '../../core/materials.js';
import { createMountains } from '../../models/landscape.js';

const SAND = { x0: -7, x1: 7, z0: -5.5, z1: 3.5 };
const DECK = { x0: -3.6, x1: 3.6, z0: 4.55, z1: 7.3 };
const POND = { x: -12.6, z: 2.4 };
const WATER_LEVEL = -0.18;
const nz = createNoise(4242);

const pondRadius = (a) => 4.3 + 0.55 * Math.sin(2 * a + 0.5) + 0.35 * Math.sin(3 * a + 1.7) + 0.18 * Math.sin(5 * a + 0.3);

function boxDist(x, z, b, m = 0) {
  const dx = Math.max(b.x0 - m - x, 0, x - b.x1 - m);
  const dz = Math.max(b.z0 - m - z, 0, z - b.z1 - m);
  return Math.hypot(dx, dz);
}
const inBox = (x, z, b, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;

function pondSD(x, z) {
  const dx = x - POND.x, dz = z - POND.z;
  return Math.hypot(dx, dz) - pondRadius(Math.atan2(dz, dx));
}

export function heightAt(x, z) {
  let h = nz.fbm2(x * 0.045, z * 0.045, 4) * 1.4 + nz.fbm2(x * 0.18 + 3, z * 0.18, 2) * 0.12;
  const dg = Math.min(boxDist(x, z, SAND, 0.5), boxDist(x, z, DECK, 0.4));
  h *= smoothstep(0, 7, dg);
  h += 0.04 * smoothstep(0.2, 2, dg); // margem levemente acima da areia
  const sd = pondSD(x, z);
  const bank = smoothstep(-3.2, 0.6, sd);
  h = mix(-1.2, Math.max(h * smoothstep(-0.5, 3, sd), -0.05), bank);
  const r = Math.hypot(x, z + 1);
  h += smoothstep(22, 46, r) * (2.5 + 7 * (nz.fbm2(x * 0.025 + 11, z * 0.025, 3) + 0.5));
  return h;
}

function createTerrain(kit) {
  const size = 170, seg = 300; // ~0,57 m: a margem do lago precisa de resolução
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const mud = new THREE.Color(0x3a3324), wet = new THREE.Color(0x6a6650), dry = new THREE.Color(0xc9c79a);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    c.setRGB(1, 1, 1);
    const sd = pondSD(x, z);
    c.lerp(wet, (1 - smoothstep(-0.2, 1.2, sd)) * 0.7);
    c.lerp(mud, 1 - smoothstep(-1.2, -0.1, sd));
    const r = Math.hypot(x, z + 1);
    c.lerp(dry, smoothstep(26, 55, r) * 0.25 * (0.6 + nz.fbm2(x * 0.05, z * 0.05, 2)));
    c.multiplyScalar(0.9 + nz.fbm2(x * 0.3 + 7, z * 0.3, 2) * 0.25);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const map = kit.ground.map.clone();
  const nm = kit.ground.normalMap.clone();
  for (const t of [map, nm]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(size / 5, size / 5);
    t.needsUpdate = true;
  }
  const mat = new THREE.MeshStandardMaterial({ map, normalMap: nm, normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true, roughness: 0.97 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Catálogo do que o jogador pode adicionar e mover
// ---------------------------------------------------------------------------
export const catalog = {
  pedra: { label: 'Pedra', surface: 'ground', create: (s, o = {}) => createRock(s, { size: o.size ?? 0.35 + rng(s)() * 0.5, island: o.island ?? rng(s + 1)() > 0.55 }), sound: 'stone' },
  pilha: { label: 'Pedras empilhadas', surface: 'ground', create: (s) => createCairn(s), sound: 'stone' },
  lanterna: { label: 'Lanterna', surface: 'ground', create: (s) => createLantern(s), sound: 'stone' },
  velas: { label: 'Velas', surface: 'ground', create: (s) => createCandles(s), sound: 'chime' },
  pinheiro: { label: 'Pinheiro', surface: 'ground', create: (s) => createPine(s, { size: 0.9 + rng(s)() * 0.4 }), sound: 'wood' },
  arbusto: { label: 'Azaleia', surface: 'ground', create: (s) => createShrub(s, { size: 0.55 + rng(s)() * 0.25, flowers: 0.7 }), sound: 'wood' },
  lotus: { label: 'Lótus', surface: 'water', create: (s) => createLotus(s), sound: 'water' },
};

// Jardim inicial. `opts` vai para o create() e é salvo junto com o objeto.
const DEFAULT_ITEMS = [
  { type: 'pedra', x: -3.7, z: -2.7, seed: 11, opts: { size: 1.0, island: true } },
  { type: 'pedra', x: -2.5, z: -1.75, seed: 12, opts: { size: 0.5, island: false } },
  { type: 'pedra', x: -4.6, z: -1.8, seed: 13, opts: { size: 0.38, island: false } },
  { type: 'pedra', x: 2.6, z: -0.6, seed: 14, opts: { size: 0.78, island: true } },
  { type: 'pedra', x: 3.55, z: -1.25, seed: 15, opts: { size: 0.42, island: false } },
  { type: 'pedra', x: 5.0, z: -4.0, seed: 16, opts: { size: 0.6, island: true } },
  { type: 'pedra', x: -0.6, z: 1.6, seed: 17, opts: { size: 0.45, island: false } },
  { type: 'lanterna', x: -8.3, z: -1.4, seed: 3, rot: 0.4 },
  { type: 'lanterna', x: 7.9, z: 3.4, seed: 4, rot: -0.3 },
  { type: 'velas', x: 2.5, z: 5.35, seed: 5 },
  { type: 'pinheiro', x: -8.8, z: -5.4, seed: 6 },
  { type: 'pinheiro', x: 11.2, z: 2.6, seed: 7 },
  { type: 'pilha', x: -6.3, z: -3.9, seed: 8 },
  { type: 'lotus', x: -12.0, z: 1.2, seed: 9 },
  { type: 'lotus', x: -13.6, z: 3.6, seed: 10 },
  { type: 'lotus', x: -10.6, z: 3.4, seed: 18 },
];

export async function build({ engine, audio, tick }) {
  const { scene } = engine;
  const kit = initKit();
  await tick('texturas');

  const terrain = createTerrain(kit);
  scene.add(terrain);
  const mountains = createMountains();
  scene.add(mountains.group);
  await tick('terreno');

  // areia
  const sand = createSand({ renderer: engine.renderer, width: SAND.x1 - SAND.x0, depth: SAND.z1 - SAND.z0, sandMap: kit.sand });
  sand.mesh.position.set((SAND.x0 + SAND.x1) / 2, 0.025, (SAND.z0 + SAND.z1) / 2);
  scene.add(sand.mesh);
  scene.add(createCurbs(SAND));

  // deck, almofada, incenso
  const deck = createDeck({ ...DECK, height: 0.32 });
  scene.add(deck.group);
  const cushion = createCushion();
  cushion.position.set(0, 0.32, 5.95);
  scene.add(cushion);
  const incense = createIncense();
  incense.position.set(0.85, 0.32, 5.45);
  scene.add(incense);
  // pedra de calçar sob a frente do deck e caminho de pedras até o lago
  const decor = new THREE.Group();
  scene.add(decor);
  const flatStone = (x, z, size, seed, rot = 0) => {
    const g = rockGeometry(seed, { detail: 3, sx: 1, sy: 0.22, sz: 0.75, rough: 0.12, flat: -0.6, moss: 0.15 });
    const m = new THREE.Mesh(g, kit.stone);
    m.scale.setScalar(size);
    m.position.set(x, heightAt(x, z) + 0.03, z);
    m.rotation.y = rot;
    m.castShadow = m.receiveShadow = true;
    decor.add(m);
  };
  flatStone(0, 7.75, 0.6, 201, 0.1);
  [[-4.3, 6.4], [-5.3, 5.9], [-6.2, 5.2], [-7.1, 4.7]].forEach(([x, z], i) => flatStone(x, z, 0.38 + (i % 2) * 0.06, 210 + i, i));
  await tick('jardim');

  // lago
  const pond = createPond({ center: POND, radiusAt: pondRadius, level: WATER_LEVEL });
  scene.add(pond.group);
  // pedras na margem
  const Rr = rng(300);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + Rr() * 0.2;
    if (Math.cos(a) > 0.75 && Math.sin(a) > -0.2 && Math.sin(a) < 0.7) continue; // abertura para o caminho
    const r = pondRadius(a) + (Rr() - 0.4) * 0.5;
    const x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r;
    const rock = createRock(400 + i, { size: 0.25 + Rr() * 0.4, moss: 0.7, rough: 0.55, sy: 0.4 + Rr() * 0.4, detail: 3 });
    rock.position.set(x, Math.max(heightAt(x, z), WATER_LEVEL) - 0.05, z);
    decor.add(rock);
  }
  // shishi-odoshi na margem voltada para o deck
  const shishi = createShishiOdoshi();
  {
    const a = 0.08; // margem direita: de perfil para quem olha do deck
    const r = pondRadius(a) + 0.25;
    const x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r;
    shishi.group.position.set(x, heightAt(x, z), z);
    shishi.group.scale.setScalar(1.4);
    shishi.group.rotation.y = Math.atan2(POND.x - x, POND.z - z);
    scene.add(shishi.group);
    const basin = createRock(500, { size: 0.42, moss: 0.4 });
    basin.position.set(x + 0.7, heightAt(x, z), z + 0.2);
    decor.add(basin);
  }
  shishi.onKnock = () => audio.knock();
  shishi.onPour = () => audio.pour();
  await tick('lago');

  // bordo
  const maple = createMaple(7, { scale: 1.15 });
  maple.group.position.set(9.9, heightAt(9.9, -3.6), -3.6);
  maple.group.rotation.y = 0.6;
  maple.groundAt.fn = (x, z) => (inBox(x, z, SAND) ? 0.03 : inBox(x, z, DECK) ? 0.32 : Math.max(heightAt(x, z), WATER_LEVEL));
  scene.add(maple.group);

  // arbustos
  [[-5.2, -7.6, 1.1, 0], [-1.6, -8.4, 1.3, 0], [2.6, -7.8, 1.0, 0], [6.0, -7.3, 1.2, 0], [-15.8, -1.8, 0.9, 0.8],
    [-16.4, 5.8, 0.8, 0.8], [-8.0, 7.7, 0.7, 0.9], [12.9, -0.8, 1.0, 0], [8.4, 6.6, 0.8, 0.8], [-10.4, -3.6, 0.9, 0]]
    .forEach(([x, z, s, f], i) => {
      const sh = createShrub(600 + i, { size: s, flowers: f });
      sh.position.set(x, heightAt(x, z), z);
      decor.add(sh);
    });
  await tick('árvores');

  // bambuzal ao fundo, em touceiras
  const Rb = rng(900);
  const culms = [];
  // fundo e esquerda fechados; clareira atrás do bordo, na direção do pôr do sol
  for (let c = 0; c < 30; c++) {
    const u = c / 29;
    const a = -Math.PI * (u < 0.15 ? 0.04 + u * 0.9 : 0.44 + (u - 0.15) / 0.85 * 0.55) + (Rb() - 0.5) * 0.06;
    const r = 17 + Rb() * 7;
    const cx = Math.cos(a) * r, cz = -1 + Math.sin(a) * r;
    const n = 4 + Math.floor(Rb() * 5);
    for (let k = 0; k < n; k++) {
      const x = cx + (Rb() - 0.5) * 1.6, z = cz + (Rb() - 0.5) * 1.6;
      culms.push(new THREE.Vector3(x, heightAt(x, z), z));
    }
  }
  scene.add(createBambooGrove(culms, { heightAt, quality: engine.quality }));

  // pinheiros grandes na clareira, em silhueta contra o pôr do sol
  [[15, -14, 3.2], [19.5, -11, 2.6], [23, -17, 3.6], [12.5, -19.5, 2.9], [27, -9, 2.4], [18, -23, 3.3], [30.5, -16, 3.0]]
    .forEach(([x, z, s], i) => {
      const p = createPine(800 + i, { size: s });
      p.position.set(x, heightAt(x, z) - 0.1, z);
      p.rotation.y = i * 1.7;
      decor.add(p);
    });

  // grama: mais densa na margem do lago, junto às pedras e no pé do bambuzal
  const Rg = rng(1000);
  const tufts = [];
  const target = engine.quality === 'mobile' ? 2400 : 4600;
  for (let tries = 0; tufts.length < target && tries < target * 12; tries++) {
    const x = (Rg() - 0.5) * 70, z = (Rg() - 0.5) * 60 - 2;
    if (inBox(x, z, SAND, 0.35) || inBox(x, z, DECK, 0.2)) continue;
    const sd = pondSD(x, z);
    if (sd < -0.15) continue;
    const r = Math.hypot(x, z + 1);
    let p = 0.05;
    p += (1 - smoothstep(0, 1.6, sd)) * 0.9;
    p += smoothstep(13, 17, r) * 0.5;
    p += smoothstep(0.1, 0.5, nz.fbm2(x * 0.2, z * 0.2, 2)) * 0.35;
    if (r > 40) p *= 0.3;
    if (Rg() > p) continue;
    tufts.push({ x, z, y: heightAt(x, z), s: sd < 1 ? 1.3 : 1, dry: smoothstep(20, 35, r) });
  }
  scene.add(createGrass(tufts));
  bakeStatic(decor); // decoração fixa (pedras, arbustos, pinheiros): uma malha por material
  mergeInstanced(decor); // folhinhas e flores de todos os arbustos numa instância só
  await tick('grama');

  // atmosfera
  const fireflies = createFireflies({ count: 110, area: [-18, 16, -14, 9], heightAt });
  scene.add(fireflies.points);
  const mist = createMist(kit.blob, { count: 22, area: [-30, 30, -24, 6], heightAt });
  scene.add(mist.group);

  // -------------------------------------------------------------------------
  // Superfícies: quem pode receber objetos e onde o raio do ponteiro bate.
  // Analítico (sem testar milhares de triângulos a cada movimento do mouse).
  const sandTop = 0.03;
  const deckTop = deck.height;
  const tmpP = new THREE.Vector3();

  function pickSurface(ray) {
    const hits = [];
    const plane = (y) => {
      if (Math.abs(ray.direction.y) < 1e-5) return null;
      const t = (y - ray.origin.y) / ray.direction.y;
      if (t <= 0) return null;
      return { t, p: ray.at(t, new THREE.Vector3()) };
    };
    const hd = plane(deckTop);
    if (hd && inBox(hd.p.x, hd.p.z, DECK)) hits.push({ ...hd, kind: 'deck' });
    const hs = plane(sandTop);
    if (hs && inBox(hs.p.x, hs.p.z, SAND)) {
      hits.push({ ...hs, kind: 'sand', uv: new THREE.Vector2((hs.p.x - SAND.x0) / (SAND.x1 - SAND.x0), 1 - (hs.p.z - SAND.z0) / (SAND.z1 - SAND.z0)) });
    }
    const hw = plane(WATER_LEVEL);
    if (hw && pond.inside(hw.p.x, hw.p.z, -0.2)) hits.push({ ...hw, kind: 'water' });
    // terreno: marcha ao longo do raio + bisseção
    let prevT = 0, found = null;
    for (let t = 0.5; t < 120; t += t < 30 ? 0.25 : 0.8) {
      ray.at(t, tmpP);
      if (tmpP.y < heightAt(tmpP.x, tmpP.z)) {
        let a = prevT, b = t;
        for (let k = 0; k < 10; k++) {
          const m = (a + b) / 2;
          ray.at(m, tmpP);
          if (tmpP.y < heightAt(tmpP.x, tmpP.z)) b = m; else a = m;
        }
        found = { t: b, p: ray.at(b, new THREE.Vector3()), kind: 'ground' };
        break;
      }
      prevT = t;
    }
    if (found && !inBox(found.p.x, found.p.z, SAND) && !(pondSD(found.p.x, found.p.z) < -0.2)) hits.push(found);
    hits.sort((a, b) => a.t - b.t);
    return hits[0] || null;
  }

  function surfaceHeight(x, z, surface) {
    if (surface === 'water') return WATER_LEVEL + 0.01;
    if (inBox(x, z, DECK)) return deckTop;
    if (inBox(x, z, SAND)) return sandTop;
    return heightAt(x, z);
  }

  // Um ponto aceita o objeto? (lótus só na água; o resto, fora dela)
  function accepts(hit, def) {
    if (!hit) return false;
    if (def.surface === 'water') return hit.kind === 'water' && pond.inside(hit.p.x, hit.p.z, 0.5);
    if (hit.kind === 'water') return false;
    if (Math.hypot(hit.p.x, hit.p.z + 1) > 21) return false; // fica dentro do jardim
    return true;
  }

  // -------------------------------------------------------------------------
  function applyTime(s) {
    mountains.apply(s);
    lanternGlow.emissiveIntensity = 0.25 + s.lantern * 3.2;
    lanternHalo.opacity = s.lantern * 0.55;
    fireflies.uniforms.uIntensity.value = s.fireflies;
    globalUniforms.uLeafGlow.value = s.leafGlow;
    engine.lightPool.factor = s.lantern;
    audio.setEnvironment({ birds: s.birds, crickets: s.crickets });
  }

  function update(dt, t) {
    pond.update(dt, t);
    shishi.update(dt, t);
    maple.update(dt, t);
    sand.update();
    mist.update(dt, t, engine.camera, engine.timeOfDay.current.mist, engine.timeOfDay.current.fogColor.clone().lerp(new THREE.Color(1, 1, 1), 0.35));
    // vento: a força acompanha as rajadas do som
    const gust = audio.gust ?? 0.25;
    globalUniforms.uWind.value += ((0.6 + gust * 2) - globalUniforms.uWind.value) * Math.min(1, dt * 0.5);
  }

  // Objetos dentro da areia ganham anéis rastelados em volta. [{x, z, r}] no mundo.
  const sandCenters = (list) => list
    .filter((d) => inBox(d.x, d.z, SAND, -0.2))
    .map((d) => ({ x: d.x - (SAND.x0 + SAND.x1) / 2, z: d.z - (SAND.z0 + SAND.z1) / 2, r: d.r }));

  return {
    id: 'jardim-zen',
    name: 'Jardim Zen',
    catalog: { ...catalog },
    defaultItems: DEFAULT_ITEMS.map((d) => ({ ...d })),
    sand,
    sandCenters,
    limits: { total: 40, perType: { pinheiro: 8, arbusto: 8 } },
    // onde se pode pisar ao caminhar: na areia rastelada, não (como num jardim zen de verdade)
    standAt: (x, z) => {
      if (inBox(x, z, DECK)) return { y: 0.32, kind: 'wood' };
      if (inBox(x, z, SAND, 0.08)) return null;
      if (pondSD(x, z) < 0.35) return null;
      if (Math.hypot(x, z + 1) > 24) return null;
      return { y: heightAt(x, z), kind: 'grass' };
    },
    walkStart: { x: 0, z: 6.4, yaw: 0 },
    viewpoints: [
      { name: 'Deck (vista inicial)', position: new THREE.Vector3(1.5, 5.6, 16.5), target: new THREE.Vector3(0.5, 1.3, -1.5) },
      { name: 'Jardim de areia, do alto', position: new THREE.Vector3(0, 14, 6), target: new THREE.Vector3(0, 0, -1) },
      { name: 'Lago das carpas', position: new THREE.Vector3(-7, 3.2, 8.5), target: new THREE.Vector3(-12.6, 0, 2.4) },
      { name: 'Shishi-odoshi', position: new THREE.Vector3(-5, 1.9, 4.8), target: new THREE.Vector3(-7.3, 0.4, 2.8) },
      { name: 'Bordo vermelho', position: new THREE.Vector3(5, 3, 3), target: new THREE.Vector3(9.9, 2.2, -3.6) },
      { name: 'Bambuzal', position: new THREE.Vector3(-3, 2.6, -9), target: new THREE.Vector3(-7, 2, -17) },
    ],
    pond,
    pickSurface,
    surfaceHeight,
    accepts,
    applyTime,
    update,
    clickables: [
      { object: shishi.group, onClick: () => shishi.trigger() },
    ],
    onWaterClick: (p) => { pond.ripple(p); audio.plip(); },
    mood: { root: 'D', scale: [0, 2, 4, 7, 9] },
    camera: { position: new THREE.Vector3(1.5, 5.6, 16.5), target: new THREE.Vector3(0.5, 1.3, -1.5) },
  };
}

export default { id: 'jardim-zen', name: 'Jardim Zen', description: 'Areia rastelada, lago de carpas e bambuzal ao entardecer.', build };
