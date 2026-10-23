// Ambiente 3 — Floresta de Musgo.
// Uma floresta antiga e úmida (como Yakushima): um riacho desce o vale em
// degraus, de poço em poço, com pequenas cascatas espumando entre pedras
// cobertas de musgo. Cedros milenares de troncos enormes, raízes agarradas ao
// chão, samambaias, troncos caídos, uma ponte de troncos e pedras de travessia.
// De manhã a névoa fica presa entre as árvores e o sol entra em raios; à
// noite os vaga-lumes sobem do riacho e os cogumelos brilham de leve.
import * as THREE from 'three';
import { createNoise, rng, smoothstep, mix, clamp } from '../../core/noise.js';
import { createFireflies, createMist, createLightShafts } from '../../core/atmosphere.js';
import { globalUniforms, bakeStatic, mergeInstanced } from '../../core/materials.js';
import { initKit } from '../../models/kit.js';
import { createRock, createCairn, rockGeometry } from '../../models/rock.js';
import { createLantern, lanternGlow, lanternHalo } from '../../models/lantern.js';
import { createCandles } from '../../models/candle.js';
import { createShrub } from '../../models/trees.js';
import { createGrass } from '../../models/bamboo.js';
import { createWaterRock } from '../../models/waterlife.js';
import { createFloatingLantern, paperGlow } from '../../models/boat.js';
import { createStream, createSpray } from '../../models/stream.js';
import {
  createAncientCedar, createFallenLog, createFerns, createFern, createMushrooms, mushroomGlow, mushroomStem,
  createLogBridge, createPaperBoat,
} from '../../models/forest.js';

const nz = createNoise(2024);

// Leito do riacho (x, z), de cima (fundo do vale) para baixo (perto de quem olha).
// Os z crescem sempre: o vale "desce" na direção da câmera.
const PATH = [[10, -58], [6, -46], [-2, -36], [-4, -26], [1, -17], [2, -8], [-2, 0], [-4, 6], [-11, 10], [-22, 13], [-34, 14]];

// Campo de distâncias: para cada ponto do chão, a distância ao eixo do riacho
// e a posição ao longo dele (s, em metros). Calculado uma vez numa grade e
// lido com interpolação: o relevo, a água e o clique dependem disso.
const GRID = { x0: -66, z0: -94, cell: 0.5, nx: 264, nz: 264 };
const STEP = 0.25;

function buildRiver() {
  const curve = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const len = curve.getLength();
  const n = Math.ceil(len / STEP);
  const px = new Float32Array(n + 1), pz = new Float32Array(n + 1);
  const tx = new Float32Array(n + 1), tz = new Float32Array(n + 1);
  const p = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = Math.min(1, (i * STEP) / len);
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    const l = Math.hypot(t.x, t.z) || 1;
    px[i] = p.x; pz[i] = p.z; tx[i] = t.x / l; tz[i] = t.z / l;
  }
  const D = new Float32Array(GRID.nx * GRID.nz), S = new Float32Array(GRID.nx * GRID.nz);
  const seg = (i, x, z) => {
    const ax = px[i], az = pz[i], bx = px[i + 1] - ax, bz = pz[i + 1] - az;
    const k = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1), 0, 1);
    return [Math.hypot(x - ax - bx * k, z - az - bz * k), (i + k) * STEP];
  };
  const COARSE = 8;
  for (let gz = 0; gz < GRID.nz; gz++) {
    for (let gx = 0; gx < GRID.nx; gx++) {
      const x = GRID.x0 + gx * GRID.cell, z = GRID.z0 + gz * GRID.cell;
      // primeiro um ponto a cada 2 m; depois os segmentos em volta do melhor
      let best = 0, bd = Infinity;
      for (let i = 0; i <= n; i += COARSE) {
        const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      let md = Infinity, ms = 0;
      for (let i = Math.max(0, best - COARSE * 2); i < Math.min(n, best + COARSE * 2); i++) {
        const [d, s] = seg(i, x, z);
        if (d < md) { md = d; ms = s; }
      }
      D[gz * GRID.nx + gx] = md;
      S[gz * GRID.nx + gx] = Math.min(ms, len);
    }
  }
  return { curve, len, n, px, pz, tx, tz, D, S };
}

// ---------------------------------------------------------------------------
// Catálogo: no chão, pedra, lanterna, velas, cogumelos e samambaia; na água,
// pedras e o que desce a correnteza (lanternas de papel e barquinhos).
// ---------------------------------------------------------------------------
const streamRock = (s, o = {}) => {
  const g = createWaterRock(s, o);
  g.children[0].position.y -= 0.18; // o leito é fundo: a pedra assenta nele
  g.userData.obstacle = true;
  return g;
};
export const catalog = {
  pedra: { label: 'Pedra com musgo', short: 'Pedra', surface: 'ground', create: (s, o = {}) => createRock(s, { size: o.size ?? 0.35 + rng(s)() * 0.55, moss: 0.95 }), sound: 'stone' },
  pilha: { label: 'Pedras empilhadas', short: 'Pilha', surface: 'ground', create: (s) => createCairn(s), sound: 'stone' },
  lanterna: { label: 'Lanterna', short: 'Lanterna', surface: 'ground', create: (s) => createLantern(s), sound: 'stone' },
  velas: { label: 'Velas', short: 'Velas', surface: 'ground', create: (s) => createCandles(s), sound: 'chime' },
  cogumelos: { label: 'Cogumelos', short: 'Cogumelos', surface: 'ground', create: (s) => createMushrooms(s), sound: 'wood' },
  samambaia: { label: 'Samambaia', short: 'Samambaia', surface: 'ground', create: (s, o = {}) => createFern(s, o), sound: 'wood' },
  pedraRiacho: { label: 'Pedra no riacho', short: 'Rocha', surface: 'water', create: streamRock, sound: 'stone' },
  flutuante: { label: 'Lanterna flutuante', short: 'Flutuante', surface: 'water', create: (s) => createFloatingLantern(s), sound: 'water' },
  barquinho: { label: 'Barquinho de papel', short: 'Barquinho', surface: 'water', create: (s) => createPaperBoat(s), sound: 'water' },
};

const C = (h) => new THREE.Color(h);
const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
// A floresta tem névoa mais densa e esverdeada; o sol fica do outro lado do
// vale (contra a luz, os raios aparecem) e alto o bastante para entrar na copa.
const PRESETS = {
  amanhecer: {
    sunDir: V(-0.38, 0.55, -0.75), fogColor: C('#b9c3b2'), fogDensity: 0.017, hemiGround: C('#3d4a2c'),
    hemiIntensity: 0.62, exposure: 1.05, mist: 1.25, mountain: C('#7d8a86'),
  },
  dia: {
    sunDir: V(-0.3, 0.8, -0.52), fogColor: C('#aebfb0'), fogDensity: 0.014, hemiGround: C('#3f4f2c'), mountain: C('#7f948c'),
  },
  entardecer: {
    sunDir: V(0.5, 0.32, -0.8), fogColor: C('#c49c80'), fogDensity: 0.016, hemiGround: C('#3e3a28'),
  },
  noite: {
    fogColor: C('#16213a'), fogDensity: 0.019, mist: 0.8, hemiIntensity: 0.85, exposure: 1.6, sunIntensity: 0.7,
  },
};

export async function build({ engine, audio, tick }) {
  const { scene } = engine;
  const kit = initKit();
  const river = buildRiver();
  const { len: LEN, px, pz, tx, tz } = river;
  await tick('texturas');

  // leitura do campo (bilinear)
  const L = { d: 0, s: 0 };
  function lookup(x, z, out = L) {
    const fx = clamp((x - GRID.x0) / GRID.cell, 0, GRID.nx - 1.001), fz = clamp((z - GRID.z0) / GRID.cell, 0, GRID.nz - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), ax = fx - ix, az = fz - iz;
    const i = iz * GRID.nx + ix;
    const { D, S } = river;
    out.d = (D[i] * (1 - ax) + D[i + 1] * ax) * (1 - az) + (D[i + GRID.nx] * (1 - ax) + D[i + GRID.nx + 1] * ax) * az;
    out.s = (S[i] * (1 - ax) + S[i + 1] * ax) * (1 - az) + (S[i + GRID.nx] * (1 - ax) + S[i + GRID.nx + 1] * ax) * az;
    // fora da grade: longe do riacho
    const ox = Math.max(GRID.x0 - x, 0, x - (GRID.x0 + GRID.cell * (GRID.nx - 1)));
    const oz = Math.max(GRID.z0 - z, 0, z - (GRID.z0 + GRID.cell * (GRID.nz - 1)));
    out.d += Math.hypot(ox, oz);
    return out;
  }
  const sNear = (x, z) => lookup(x, z, {}).s;
  const idxAt = (s) => clamp(Math.round(s / STEP), 0, river.n);
  const pointAt = (s) => { const i = idxAt(s); return { x: px[i], z: pz[i], dx: tx[i], dz: tz[i] }; };

  // --- o perfil do riacho: degraus (cascatas) e poços ------------------------
  const sPool = sNear(-3.2, 4.2);
  const DROPS = [
    { s: sNear(8.5, -52), d: 0.9, l: 1.2 },
    { s: sNear(1.5, -40.5), d: 0.8, l: 1.0 },
    { s: sNear(-4, -29.5), d: 1.5, l: 1.3 },
    { s: sNear(1.6, -12.5), d: 0.8, l: 1.0 },
    { s: sPool - 6.2, d: 0.55, l: 0.9 },
    { s: sPool + 4.6, d: 0.6, l: 1.0 }, // saída do poço
  ];
  const sOut = DROPS[DROPS.length - 1].s;
  const bump = (s, a, b, ramp = 2) => smoothstep(a - ramp, a, s) * (1 - smoothstep(b, b + ramp, s));
  const levelBase = -DROPS[DROPS.length - 1].d;
  function levelAt(s) {
    let w = levelBase + 0.008 * (sPool - s);
    for (const c of DROPS) w += c.d * (1 - smoothstep(c.s - c.l / 2, c.s + c.l / 2, s));
    return w;
  }
  function halfWidth(s) {
    let hw = 1.25 + 0.3 * nz.fbm2(s * 0.12, 3.7, 2);
    for (const c of DROPS) {
      hw += 0.8 * bump(s, c.s - 5.5, c.s - 1.2) - 0.25 * bump(s, c.s - 0.6, c.s + 0.6, 0.8);
    }
    hw += 2.0 * bump(s, sPool - 3.5, sPool + 2.6, 2.5); // o poço grande
    return hw;
  }
  function speedAt(s) {
    let v = 0.42 * 1.3 / halfWidth(s);
    for (const c of DROPS) v += 1.3 * bump(s, c.s - c.l / 2, c.s + c.l / 2, 0.5);
    return v;
  }
  function foamAt(s) {
    let f = 0.04;
    for (const c of DROPS) {
      const a = c.s - c.l / 2, b = c.s + c.l / 2;
      if (s > a - 0.3 && s < b) f = Math.max(f, smoothstep(a - 0.3, a + 0.2, s));
      else if (s >= b) f = Math.max(f, Math.exp(-(s - b) / 1.6) * Math.min(0.85, c.d * 0.8));
    }
    return f;
  }

  // nível do fundo do vale longe do riacho: o nível da água ao longo de z, suavizado
  const VZ = { z0: GRID.z0, step: 0.5, n: Math.ceil((GRID.nz * GRID.cell) / 0.5) + 1 };
  const valley = new Float32Array(VZ.n);
  {
    const raw = new Float32Array(VZ.n);
    let i = 0;
    for (let k = 0; k < VZ.n; k++) {
      const z = VZ.z0 + k * VZ.step;
      while (i < river.n && pz[i + 1] < z) i++;
      raw[k] = levelAt(i * STEP);
    }
    const W = 24; // ±12 m
    for (let k = 0; k < VZ.n; k++) {
      let sum = 0, c = 0;
      for (let j = Math.max(0, k - W); j <= Math.min(VZ.n - 1, k + W); j++) { sum += raw[j]; c++; }
      valley[k] = sum / c;
    }
  }
  const valleyAt = (z) => valley[clamp(Math.round((z - VZ.z0) / VZ.step), 0, VZ.n - 1)];

  // --- relevo -----------------------------------------------------------------
  const M = { d: 0, s: 0 };
  function heightAt(x, z) {
    lookup(x, z, M);
    return heightFrom(x, z, M.d, M.s);
  }
  function heightFrom(x, z, d, s) {
    const w = levelAt(s), hw = halfWidth(s);
    const near = 1 - smoothstep(hw + 1.5, hw + 12, d);
    const floor = mix(valleyAt(z), w, near) + 0.3;
    // encostas do vale e, perto do riacho, o chão fofo e ondulado do musgo
    const wall = Math.pow(smoothstep(hw + 4, 46, d), 1.4) * (11 + 7 * nz.fbm2(x * 0.03 + 5, z * 0.03, 3));
    const hummock = nz.fbm2(x * 0.17, z * 0.17, 3) * 0.55 * smoothstep(hw + 0.4, hw + 4, d) + nz.fbm2(x * 0.7 + 3, z * 0.7, 2) * 0.1;
    const ground = floor + smoothstep(hw, hw + 3, d) * 0.35 + wall + hummock;
    if (d > hw + 1.2) return ground;
    const depth = (0.48 + 0.18 * nz.fbm2(s * 0.2, 1.3, 2)) * (1 + bump(s, sPool - 3, sPool + 2.2) * 0.6);
    const q = Math.min(1, d / hw);
    const bed = w - 0.05 - depth * (1 - q * q) + nz.fbm2(x * 1.3, z * 1.3, 2) * 0.06;
    return mix(bed, ground, smoothstep(hw - 0.35, hw + 0.9, d));
  }
  // água: só dentro do leito
  function waterAt(x, z) {
    lookup(x, z, M);
    return M.d < halfWidth(M.s) + 0.9 ? levelAt(M.s) : -Infinity;
  }

  // --- terreno ----------------------------------------------------------------
  {
    const size = 132, seg = 330;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -28);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const bedC = new THREE.Color(0.62, 0.62, 0.55), wetC = new THREE.Color(0.66, 0.7, 0.55), lushC = new THREE.Color(1.0, 1.12, 0.82), litterC = new THREE.Color(1.15, 0.86, 0.6);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      lookup(x, z, M);
      const d = M.d, s = M.s, hw = halfWidth(s);
      pos.setY(i, heightFrom(x, z, d, s));
      c.setRGB(1, 1, 1);
      // musgo mais viçoso perto da água; folhas secas em manchas nas encostas
      c.lerp(lushC, 1 - smoothstep(hw + 1, hw + 7, d));
      const litter = smoothstep(0.1, 0.45, nz.fbm2(x * 0.07 + 9, z * 0.07, 3)) * smoothstep(hw + 5, hw + 14, d);
      c.lerp(litterC, litter * 0.7);
      c.lerp(wetC, (1 - smoothstep(hw - 0.1, hw + 1.1, d)) * 0.6);
      c.lerp(bedC, 1 - smoothstep(hw - 0.5, hw + 0.15, d));
      c.multiplyScalar(0.86 + nz.fbm2(x * 0.3 + 7, z * 0.3, 2) * 0.3);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const map = kit.ground.map.clone(), nm = kit.ground.normalMap.clone();
    for (const t of [map, nm]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(size / 4, size / 4);
      t.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, normalMap: nm, normalScale: new THREE.Vector2(1.1, 1.1), vertexColors: true, roughness: 0.96 }));
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  await tick('terreno');

  // --- riacho -------------------------------------------------------------------
  const rows = [];
  for (let s = 0; s <= LEN; s += 0.3) {
    const p = pointAt(s);
    rows.push({ x: p.x, z: p.z, dx: p.dx, dz: p.dz, y: levelAt(s), hw: halfWidth(s), s, speed: speedAt(s), foam: foamAt(s) });
  }
  const stream = createStream({ rows, bedAt: heightAt, envIntensity: 0.5, reflCap: 0.12 });
  scene.add(stream.mesh);
  const spray = createSpray(DROPS.map((c) => {
    const s = c.s + c.l * 0.45, p = pointAt(s);
    return { x: p.x, z: p.z, dx: p.dx, dz: p.dz, y: levelAt(s) + 0.02, w: halfWidth(s) * 1.5 };
  }), { perSpot: 50 });
  scene.add(spray.points);

  const decor = new THREE.Group();
  scene.add(decor);
  // ponto na margem: lado +1/-1 da correnteza, `off` metros além da meia largura
  const bankPoint = (s, side, off) => {
    const p = pointAt(s), hw = halfWidth(s);
    return [p.x - p.dz * side * (hw + off), p.z + p.dx * side * (hw + off)];
  };

  // ponte de troncos
  const sBridge = sNear(-1.4, -20.5);
  const bridge = (() => {
    const p = pointAt(sBridge), hw = halfWidth(sBridge);
    const length = 2 * (hw + 1.5);
    const sx = -p.dz, sz = p.dx;
    const ends = [1, -1].map((k) => heightAt(p.x + sx * k * length / 2, p.z + sz * k * length / 2));
    const y = Math.max(...ends) + 0.14;
    const b = createLogBridge({ length, width: 1.25, seed: 4 });
    b.group.position.set(p.x, y, p.z);
    b.group.rotation.y = Math.atan2(-sz, sx);
    decor.add(b.group);
    return {
      x: p.x, z: p.z, y, sx, sz, length, width: 1.25,
      contains(x, z, m = 0) {
        const lx = (x - p.x) * sx + (z - p.z) * sz, lz = -(x - p.x) * sz + (z - p.z) * sx;
        return Math.abs(lx) < length / 2 + m && Math.abs(lz) < 0.62 + m;
      },
    };
  })();

  // pedras de travessia
  const stones = [];
  {
    const sS = sNear(1.7, -5.6);
    const p = pointAt(sS), hw = halfWidth(sS);
    const R = rng(77);
    const n = Math.round((hw * 2 + 0.6) / 0.62);
    for (let i = 0; i < n; i++) {
      const u = -hw - 0.3 + (i + 0.5) * ((hw * 2 + 0.6) / n);
      const x = p.x - p.dz * u + p.dx * (R() - 0.5) * 0.3, z = p.z + p.dx * u + p.dz * (R() - 0.5) * 0.3;
      const size = 0.34 + R() * 0.06;
      const g = rockGeometry(1300 + i, { detail: 3, sx: 1, sy: 0.42, sz: 0.85, rough: 0.16, flat: -0.6, moss: 0.35 });
      g.computeBoundingBox();
      const m = new THREE.Mesh(g, kit.stone);
      const top = levelAt(sS) + 0.13;
      m.scale.setScalar(size);
      m.position.set(x, top - g.boundingBox.max.y * size, z);
      m.rotation.y = R() * 6;
      m.castShadow = m.receiveShadow = true;
      decor.add(m);
      stones.push({ x, z, r: size * 0.9, top });
    }
  }
  await tick('jardim');

  // --- pedras: nas cascatas, nas margens, no leito ------------------------------
  const Rr = rng(505);
  const rockAt = (x, z, size, seed, opts = {}) => {
    const r = createRock(seed, { size, moss: 0.95, rough: 0.45, detail: 3, ...opts });
    r.position.set(x, heightAt(x, z) - size * 0.25, z);
    decor.add(r);
    return r;
  };
  const obstacles = stones.map((s) => ({ x: s.x, z: s.z, r: s.r }));
  DROPS.forEach((c, k) => {
    for (const side of [-1, 1]) {
      for (let j = 0; j < 2 + (Rr() < 0.5 ? 1 : 0); j++) {
        const s = c.s + (Rr() - 0.4) * 2.4;
        const [x, z] = bankPoint(s, side, -0.2 + Rr() * 0.7);
        rockAt(x, z, 0.35 + Rr() * 0.45 + c.d * 0.45, 1400 + k * 10 + j * 2 + (side > 0 ? 1 : 0));
      }
    }
    // uma pedra no meio da queda divide a água em duas
    if (c.d > 0.7) {
      const p = pointAt(c.s - c.l * 0.3), u = (Rr() - 0.5) * halfWidth(c.s) * 0.6;
      const x = p.x - p.dz * u, z = p.z + p.dx * u;
      const r = createRock(1500 + k, { size: 0.45 + Rr() * 0.2, moss: 0.9, detail: 3 });
      r.position.set(x, levelAt(c.s - c.l * 0.3) - 0.2, z);
      decor.add(r);
      obstacles.push({ x, z, r: 0.5 });
    }
  });
  // pedras soltas pelas margens e pelo leito
  for (let i = 0; i < 70; i++) {
    const s = Rr() * (sOut + 6);
    const side = Rr() < 0.5 ? -1 : 1;
    const inBed = Rr() < 0.3;
    const [x, z] = bankPoint(s, side, inBed ? -0.4 - Rr() * 0.6 : 0.1 + Rr() * 2.5);
    if (bridge.contains(x, z, 1) || stones.some((st) => Math.hypot(st.x - x, st.z - z) < 1)) continue;
    const size = inBed ? 0.18 + Rr() * 0.22 : 0.25 + Rr() * 0.6;
    const r = rockAt(x, z, size, 1600 + i);
    if (inBed) obstacles.push({ x, z, r: size });
    else if (Rr() < 0.3) r.position.y -= size * 0.2;
  }
  // seixos no leito (aparecem pela água rasa)
  {
    const pebble = rockGeometry(31, { detail: 1, sx: 1, sy: 0.5, sz: 0.8, rough: 0.2, moss: 0 });
    const list = [];
    const R = rng(91);
    for (let tries = 0; tries < 9000 && list.length < 900; tries++) {
      const s = R() * Math.min(LEN, sOut + 20), u = (R() * 2 - 1) * 0.95;
      const p = pointAt(s), hw = halfWidth(s);
      const x = p.x - p.dz * u * hw, z = p.z + p.dx * u * hw;
      list.push([x, heightAt(x, z), z, 0.05 + R() * 0.09, R() * 6]);
    }
    const inst = new THREE.InstancedMesh(pebble, kit.stone, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3();
    list.forEach(([x, y, z, sc, r], i) => {
      q.setFromEuler(e.set(0, r, 0));
      inst.setMatrixAt(i, m4.compose(v.set(x, y + sc * 0.15, z), q, s.set(sc, sc, sc)));
    });
    const pc = new THREE.Color();
    list.forEach((_, i) => inst.setColorAt(i, pc.setRGB(0.5, 0.52, 0.45).multiplyScalar(0.7 + R() * 0.5)));
    inst.receiveShadow = true;
    scene.add(inst);
  }
  await tick('lago');

  // --- árvores ---------------------------------------------------------------
  // linha de vista inicial: nada de tronco grosso no meio dela
  const CAM = { x: 2, z: 16 }, TGT = { x: -2.5, z: -8 };
  const viewDist = (x, z) => {
    const vx = TGT.x - CAM.x, vz = TGT.z - CAM.z, l2 = vx * vx + vz * vz;
    const k = clamp(((x - CAM.x) * vx + (z - CAM.z) * vz) / l2, 0, 1.6);
    return Math.hypot(x - CAM.x - vx * k, z - CAM.z - vz * k);
  };
  const trunks = []; // { x, z, r } para afastar outras árvores, samambaias etc.
  const freeOf = (x, z, r) => trunks.every((t) => Math.hypot(t.x - x, t.z - z) > t.r + r);
  const plantCedar = (x, z, size, seed, opts = {}) => {
    const y0 = heightAt(x, z);
    const t = createAncientCedar(seed, { size, height: 17 + size * 4, groundAt: (dx, dz) => heightAt(x + dx, z + dz) - y0, ...opts });
    t.position.set(x, y0 - 0.1, z);
    t.rotation.y = 0;
    decor.add(t);
    trunks.push({ x, z, r: 1.6 * size + 0.6, big: true, size });
  };
  // os que compõem a vista
  [[9.5, -2, 1.3], [-9.5, -6.5, 1.5], [7, -23, 1.35], [-11, -24, 1.2], [13, -35, 1.5], [-8, -44, 1.3],
    [15.5, -13, 1.1], [-16, 2, 1.35], [13.5, 8.5, 1.15], [-13, 17, 1.25], [4.5, -32, 1.0], [-5, -15, 0.9]]
    .forEach(([x, z, s], i) => plantCedar(x, z, s, 40 + i));
  // mais cedros antigos, espalhados pelo vale
  const Rt = rng(808);
  for (let tries = 0; tries < 400 && trunks.length < 34; tries++) {
    const x = (Rt() - 0.5) * 70, z = -80 + Rt() * 105;
    const { d, s } = lookup(x, z, {});
    const size = 0.85 + Rt() * 0.6;
    if (d < halfWidth(s) + 2.5 + size * 1.5 || viewDist(x, z) < 5.5 || !freeOf(x, z, 1.6 * size + 2.5)) continue;
    if (Math.hypot(x - CAM.x, z - CAM.z) < 7) continue;
    plantCedar(x, z, size, 100 + tries);
  }
  // cedros comuns mais finos ao fundo e nas encostas, para a floresta não ter fim
  for (let tries = 0; tries < 900 && trunks.length < 130; tries++) {
    const x = (Rt() - 0.5) * 110, z = -92 + Rt() * 125;
    const { d } = lookup(x, z, {});
    if (d < 9 || viewDist(x, z) < 6 || !freeOf(x, z, 1.4) || Math.hypot(x - CAM.x, z - CAM.z) < 9) continue;
    const size = 0.45 + Rt() * 0.35;
    const y0 = heightAt(x, z);
    const c = createAncientCedar(500 + tries, { size, height: 19 + Rt() * 6, far: true, groundAt: (dx, dz) => heightAt(x + dx, z + dz) - y0 });
    c.position.set(x, y0 - 0.1, z);
    decor.add(c);
    trunks.push({ x, z, r: 1.6 * size + 0.4 });
  }
  // arbustos escuros no sub-bosque
  for (let i = 0; i < 14; i++) {
    const x = (Rt() - 0.5) * 50, z = -50 + Rt() * 65;
    const { d, s } = lookup(x, z, {});
    if (d < halfWidth(s) + 2 || viewDist(x, z) < 3 || !freeOf(x, z, 1)) continue;
    const sh = createShrub(700 + i, { size: 0.7 + Rt() * 0.6 });
    sh.position.set(x, heightAt(x, z) - 0.05, z);
    decor.add(sh);
  }
  // troncos caídos: um atravessando o riacho, outros no chão
  const logs = [];
  {
    const sL = sNear(-3.6, -34);
    const p = pointAt(sL), hw = halfWidth(sL);
    const span = hw + 2.6;
    const a = [p.x - p.dz * span + p.dx * 0.8, p.z + p.dx * span + p.dz * 0.8];
    const b = [p.x + p.dz * span - p.dx * 0.8, p.z - p.dx * span - p.dz * 0.8];
    const y = Math.max(heightAt(...a), heightAt(...b));
    logs.push([new THREE.Vector3(a[0], y + 0.15, a[1]), new THREE.Vector3(b[0], y + 0.2, b[1]), 0.5]);
  }
  for (const [x0, z0, x1, z1, r] of [[8.5, -9, 14, -15.5, 0.48], [-7.5, 2.5, -12.5, -2.5, 0.42], [-6.5, -38, -14, -33, 0.55]]) {
    logs.push([new THREE.Vector3(x0, heightAt(x0, z0) + r * 0.6, z0), new THREE.Vector3(x1, heightAt(x1, z1) + r * 0.5, z1), r]);
  }
  logs.forEach(([a, b, r], i) => {
    decor.add(createFallenLog(60 + i, a, b, { radius: r }));
    const n = 6;
    for (let k = 0; k <= n; k++) trunks.push({ x: mix(a.x, b.x, k / n), z: mix(a.z, b.z, k / n), r: r + 0.2 });
  });
  // cogumelos no pé dos cedros e nos troncos caídos
  const Rm = rng(313);
  trunks.filter((t) => t.big).slice(0, 14).forEach((t, i) => {
    const a = Rm() * 6.28, d = t.r * 0.75;
    const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
    const m = createMushrooms(900 + i);
    m.position.set(x, heightAt(x, z), z);
    decor.add(m);
  });
  logs.forEach(([a, b, r], i) => {
    const p = a.clone().lerp(b, 0.3 + Rm() * 0.4);
    const m = createMushrooms(950 + i);
    m.position.set(p.x, p.y + r * 0.85, p.z);
    m.scale.setScalar(0.8);
    decor.add(m);
  });
  for (let i = 0; i < 10; i++) {
    const s = sPool - 16 + Rm() * 20, side = Rm() < 0.5 ? -1 : 1;
    const [x, z] = bankPoint(s, side, 0.8 + Rm() * 2.2);
    if (bridge.contains(x, z, 0.5)) continue;
    const m = createMushrooms(970 + i);
    m.position.set(x, heightAt(x, z), z);
    decor.add(m);
  }
  // decoração fixa: uma malha por material
  bakeStatic(decor);
  mergeInstanced(decor);
  await tick('árvores');

  // --- samambaias e grama ---------------------------------------------------------
  const Rg = rng(606);
  const fernClumps = [], tufts = [];
  for (let tries = 0; tries < 40000 && (fernClumps.length < 420 || tufts.length < 1000); tries++) {
    const x = (Rg() - 0.5) * 64, z = -64 + Rg() * 84;
    const { d, s } = lookup(x, z, {});
    const hw = halfWidth(s);
    if (d < hw + 0.35 || bridge.contains(x, z, 0.5) || !freeOf(x, z, 0.15)) continue;
    const y = heightAt(x, z);
    // samambaias: na beira d'água, no pé dos troncos e em manchas
    const nearTrunk = trunks.some((t) => t.big && Math.hypot(t.x - x, t.z - z) < t.r + 1.6);
    let p = 0.08 + (1 - smoothstep(hw + 0.5, hw + 3, d)) * 0.35 + (nearTrunk ? 0.5 : 0) + smoothstep(0.15, 0.4, nz.fbm2(x * 0.1, z * 0.1, 2)) * 0.5;
    if (viewDist(x, z) < 2 && Math.hypot(x - CAM.x, z - CAM.z) < 10) p *= 0.3;
    if (fernClumps.length < 420 && Rg() < p * 0.5) fernClumps.push({ x, y, z, s: 0.75 + Rg() * 0.6 + (nearTrunk ? 0.2 : 0) });
    else if (tufts.length < 1000 && d < hw + 2.5 && Rg() < 0.6) tufts.push({ x, z, y, s: 0.8, dry: 0 });
  }
  scene.add(createFerns(fernClumps, { seed: 12 }), createGrass(tufts, { seed: 43 }));
  await tick('grama');

  // --- luz e atmosfera ------------------------------------------------------------
  const Rs = rng(41);
  const shaftSpots = [[-6, -10], [3, -16], [-2, -26], [6, -4], [-8, -30], [4, -38], [-3.5, 1], [10, -24], [0, -48], [-12, -16]]
    .map(([x, z]) => ({ x: x + (Rs() - 0.5) * 3, z: z + (Rs() - 0.5) * 3, w: 1.3 + Rs() * 1.6 }));
  const shafts = createLightShafts({ spots: shaftSpots, groundAt: heightAt, height: 19 });
  scene.add(shafts.mesh);
  const fireflies = createFireflies({ count: 170, area: [-12, 10, -34, 8], yRange: [0.2, 2.0], heightAt: (x, z) => heightAt(x, z) });
  scene.add(fireflies.points);
  const mist = createMist(kit.blob, { count: 30, area: [-28, 28, -60, 6], yRange: [0.4, 2.2], size: [10, 18], heightAt, seed: 17 });
  scene.add(mist.group);

  // a copa é alta: o sol fica mais longe para a câmera de sombra alcançá-la
  engine.sunDistance = 95;
  engine.sun.shadow.camera.far = 170;
  engine.sun.shadow.camera.updateProjectionMatrix();
  engine.controls.maxDistance = 18;
  engine.controls.minPolarAngle = Math.PI * 0.2;

  // -------------------------------------------------------------------------------
  const tmp = new THREE.Vector3();
  const P = { d: 0, s: 0 };
  function pickSurface(ray) {
    const hits = [];
    if (Math.abs(ray.direction.y) > 1e-5) {
      const t = (bridge.y - ray.origin.y) / ray.direction.y;
      if (t > 0) {
        const p = ray.at(t, new THREE.Vector3());
        if (bridge.contains(p.x, p.z)) hits.push({ t, p, kind: 'deck' });
      }
    }
    // marcha pelo raio até cruzar o chão ou a água; depois bisseção
    const below = (p) => {
      lookup(p.x, p.z, P);
      const h = heightFrom(p.x, p.z, P.d, P.s);
      const w = P.d < halfWidth(P.s) + 0.9 ? levelAt(P.s) : -Infinity;
      return p.y < Math.max(h, w);
    };
    let prev = 0;
    for (let t = 0.5; t < 140; t += t < 30 ? 0.25 : 0.8) {
      ray.at(t, tmp);
      if (below(tmp)) {
        let a = prev, b = t;
        for (let k = 0; k < 10; k++) { const m = (a + b) / 2; ray.at(m, tmp); if (below(tmp)) b = m; else a = m; }
        const p = ray.at(b, new THREE.Vector3());
        lookup(p.x, p.z, P);
        const water = P.d < halfWidth(P.s) + 0.9 && levelAt(P.s) > heightFrom(p.x, p.z, P.d, P.s);
        hits.push({ t: b, p, kind: water ? 'water' : 'ground' });
        break;
      }
      prev = t;
    }
    hits.sort((a, b) => a.t - b.t);
    return hits[0] || null;
  }

  function surfaceHeight(x, z, surface) {
    if (surface === 'water') return levelAt(sNear(x, z)) + 0.01;
    if (bridge.contains(x, z)) return bridge.y;
    return Math.max(heightAt(x, z), waterAt(x, z));
  }
  // água livre: dentro do leito, acima da saída do poço, longe da ponte e das pedras
  const freeWater = (x, z, m = 0.3) => {
    lookup(x, z, P);
    return P.d < halfWidth(P.s) - m && P.s < sOut - 0.8 && !bridge.contains(x, z, 0.4);
  };
  function accepts(hit, def) {
    if (!hit) return false;
    if (def.surface === 'water') return hit.kind === 'water' && freeWater(hit.p.x, hit.p.z);
    if (hit.kind === 'water') return false;
    return Math.hypot(hit.p.x - 1, hit.p.z + 10) < 30;
  }

  // -------------------------------------------------------------------------------
  let items = null;
  const white = new THREE.Color(1, 1, 1), sprayC = new THREE.Color();
  function applyTime(s) {
    lanternGlow.emissiveIntensity = 0.25 + s.lantern * 3.2;
    lanternHalo.opacity = s.lantern * 0.55;
    paperGlow.emissiveIntensity = 0.35 + s.lantern * 2.2;
    mushroomGlow.emissiveIntensity = Math.max(0, s.lantern - 0.1) * 1.4;
    mushroomStem.emissiveIntensity = Math.max(0, s.lantern - 0.1) * 0.5;
    fireflies.uniforms.uIntensity.value = s.fireflies;
    globalUniforms.uLeafGlow.value = s.leafGlow;
    engine.lightPool.factor = s.lantern;
    // raios: fortes com névoa e sol baixo; de noite, só um fio de luar
    const sunUp = smoothstep(0.0, 0.25, s.sunDir.y);
    shafts.setLight(s.sunDir, s.sunColor, s.sunIntensity * sunUp * (0.05 + s.mist * 0.045) * (1 - s.stars * 0.7));
    spray.setLight(sprayC.copy(s.hemiSky).lerp(white, 0.4), 0.25 + s.hemiIntensity * 0.9);
    audio.setEnvironment({ birds: s.birds, crickets: s.crickets, water: 1.2 });
  }

  // os objetos que flutuam descem a correnteza; no poço, giram devagar
  const pool = pointAt(sPool);
  function drift(dt, t) {
    for (const it of items.items) {
      if (!it.object.userData.drift || it.removing || it.lift > 0) continue;
      const x = it.target.x, z = it.target.z;
      lookup(x, z, P);
      const s = P.s, c = pointAt(s);
      let vx, vz;
      if (s > sPool - 3.2) {
        // redemoinho do poço: em volta do centro, sem chegar à margem nem ao meio
        const rx = x - pool.x, rz = z - pool.z, r = Math.hypot(rx, rz) || 1;
        const want = clamp(r, 1.0, halfWidth(sPool) - 1.0);
        vx = (-rz / r) * 0.09 + (rx / r) * (want - r) * 0.2;
        vz = (rx / r) * 0.09 + (rz / r) * (want - r) * 0.2;
      } else {
        const v = speedAt(s) * 0.85;
        // puxa de leve para o meio (não encalha na margem)
        const ox = c.x - x, oz = c.z - z;
        vx = c.dx * v + ox * 0.25 + Math.sin(t * 0.3 + it.id) * 0.03;
        vz = c.dz * v + oz * 0.25 + Math.cos(t * 0.27 + it.id) * 0.03;
      }
      // contorna as pedras (as fixas e as que o jogador pôs na água): o empurrão
      // é só para o lado, então nada encalha e a correnteza sempre vence
      let push = 0;
      const sideX = -c.dz, sideZ = c.dx;
      const avoid = (ox, oz, r) => {
        const dx = x - ox, dz = z - oz, d = Math.hypot(dx, dz);
        if (d < r + 0.3) push += Math.sign(dx * sideX + dz * sideZ || 1) * (1 - d / (r + 0.3)) * 0.9;
      };
      for (const o of obstacles) avoid(o.x, o.z, o.r);
      for (const o of items.items) {
        if (o.object.userData.obstacle && !o.removing) avoid(o.target.x, o.target.z, o.object.userData.radius || 0.5);
      }
      vx += sideX * push; vz += sideZ * push;
      const nx = x + vx * dt, nz2 = z + vz * dt;
      lookup(nx, nz2, P);
      if (P.d < halfWidth(P.s) - 0.25) { it.target.x = nx; it.target.z = nz2; } else { it.target.x += (c.x - x) * dt * 0.5; it.target.z += (c.z - z) * dt * 0.5; }
      it.target.y = levelAt(sNear(it.target.x, it.target.z)) + 0.01;
      it.targetRot += dt * (0.05 + Math.min(0.4, Math.hypot(vx, vz) * 0.25)) * (it.id % 2 ? 1 : -1);
    }
  }

  // som das cascatas: mais alto perto das quedas (e das maiores)
  const falls = DROPS.map((c) => { const p = pointAt(c.s); return { x: p.x, y: levelAt(c.s), z: p.z, d: c.d }; });
  let nextCascade = 0;
  const mistColor = new THREE.Color();
  function update(dt, t) {
    stream.update(dt);
    const cur = engine.timeOfDay.current;
    mist.update(dt, t, engine.camera, cur.mist * 0.9, mistColor.copy(cur.fogColor).lerp(white, 0.4));
    if (items) drift(dt, t);
    nextCascade -= dt;
    if (nextCascade <= 0) {
      nextCascade = 0.25;
      const cam = engine.camera.position;
      let k = 0;
      for (const f of falls) {
        const dist = Math.hypot(cam.x - f.x, (cam.y - f.y) * 0.5, cam.z - f.z);
        k += (0.4 + f.d * 0.5) / (1 + (dist / 7) ** 2);
      }
      audio.setEnvironment({ cascade: 0.12 + Math.min(0.88, k) }); // ao longe, o murmúrio nunca some
    }
    const gust = audio.gust ?? 0.25;
    globalUniforms.uWind.value += ((0.35 + gust * 1.2) - globalUniforms.uWind.value) * Math.min(1, dt * 0.5);
  }

  // --- jardim inicial e pontos de vista -------------------------------------------
  const at = (s, side, off) => { const [x, z] = bankPoint(s, side, off); return { x, z }; };
  const mid = (s, u = 0) => { const p = pointAt(s), hw = halfWidth(s); return { x: p.x - p.dz * u * hw, z: p.z + p.dx * u * hw }; };
  // lado da margem que dá para a câmera inicial
  const camSide = (s) => {
    const p = pointAt(s);
    return Math.sign((CAM.x - p.x) * -p.dz + (CAM.z - p.z) * p.dx) || 1;
  };
  const sideP = camSide(sPool);
  const DEFAULT_ITEMS = [
    { type: 'lanterna', ...at(sPool + 1.2, sideP, 1.3), seed: 21, rot: 0.6 },
    { type: 'velas', ...at(sPool - 1.4, sideP, 1.0), seed: 22 },
    { type: 'pilha', ...at(sPool + 2.6, sideP, 2.6), seed: 23 },
    { type: 'flutuante', ...mid(sPool - 1, 0.4), seed: 31 },
    { type: 'flutuante', ...mid(sPool + 1.2, -0.5), seed: 32 },
    { type: 'flutuante', ...mid(sPool - 12, 0.1), seed: 33 },
    { type: 'barquinho', ...mid(sPool + 0.2, -0.1), seed: 34, rot: 1.2 },
    { type: 'barquinho', ...mid(sBridge - 3, 0.1), seed: 35, rot: 0.4 },
    { type: 'cogumelos', ...at(sPool - 4, sideP, 1.6), seed: 41 },
    { type: 'samambaia', ...at(sPool + 2.0, sideP, 0.9), seed: 51 },
    { type: 'samambaia', ...at(sPool - 2.5, -sideP, 1.0), seed: 52 },
    { type: 'pedraRiacho', ...mid(sPool - 9, 0.35), seed: 61, opts: { size: 0.45 } },
  ];

  const look = (from, to, h1, h2) => ({
    position: new THREE.Vector3(from.x, heightAt(from.x, from.z) + h1, from.z),
    target: new THREE.Vector3(to.x, heightAt(to.x, to.z) + h2, to.z),
  });
  const c3 = DROPS[2];
  const camera = { position: new THREE.Vector3(CAM.x, heightAt(CAM.x, CAM.z) + 5.6, CAM.z + 1.5), target: new THREE.Vector3(TGT.x, heightAt(TGT.x, TGT.z) + 0.6, TGT.z + 2) };
  const viewpoints = [
    { name: 'Margem do poço (vista inicial)', ...camera },
    { name: 'Ponte', ...look({ x: bridge.x + 2.5, z: bridge.z + 4 }, mid(c3.s), 2.8, 0.6) },
    { name: 'Cascata', ...look(mid(c3.s + 6.5, 0.3), mid(c3.s - 2), 2.4, 0.9) },
    { name: 'Beira do riacho', ...look(at(stonesS(), camSide(stonesS()), 3.5), mid(stonesS() - 6), 2.2, 0.3) },
    { name: 'Cedro antigo', ...look({ x: -0.5, z: 4.5 }, { x: -9.5, z: -6.5 }, 2.6, 4) },
    { name: 'O vale, do alto', position: new THREE.Vector3(6, levelAt(sPool) + 13, 12), target: new THREE.Vector3(0, levelAt(sBridge) + 1, -16) },
  ];
  function stonesS() { return sNear(1.7, -5.6); }

  return {
    id: 'floresta-musgo',
    name: 'Floresta de Musgo',
    catalog: { ...catalog },
    defaultItems: DEFAULT_ITEMS.map((d) => ({ ...d })),
    pickSurface,
    surfaceHeight,
    accepts,
    applyTime,
    update,
    attachItems: (m) => { items = m; },
    limits: { total: 40, perType: { flutuante: 10, barquinho: 10, lanterna: 6 } },
    // caminhar: pelo chão, pela ponte e pelas pedras de travessia; na água, não
    standAt: (x, z) => {
      if (bridge.contains(x, z, -0.1)) return { y: bridge.y, kind: 'wood' };
      for (const st of stones) if (Math.hypot(st.x - x, st.z - z) < st.r + 0.12) return { y: st.top, kind: 'stone' };
      lookup(x, z, P);
      const h = heightFrom(x, z, P.d, P.s);
      if (P.d < halfWidth(P.s) + 0.9 && levelAt(P.s) > h - 0.06) return null;
      if (Math.hypot(x - 1, z + 10) > 34) return null;
      if (trunks.some((t) => t.big && Math.hypot(t.x - x, t.z - z) < t.r * 0.7)) return null;
      return { y: h, kind: 'grass' };
    },
    walkStart: { x: CAM.x - 2, z: CAM.z - 6, yaw: 0.35 },
    viewpoints,
    clickables: [],
    onWaterClick: (p) => { stream.ripple(p.x, p.z, 1); audio.plip(); },
    mood: {
      root: 'E', scale: [0, 2, 4, 7, 9],
      chords: [[0, 7, 14, 16], [-3, 4, 9, 12], [-5, 2, 7, 14], [2, 9, 14, 16], [0, 4, 7, 14]],
    },
    camera,
  };
}

export default {
  id: 'floresta-musgo',
  name: 'Floresta de Musgo',
  description: 'Riacho entre cedros milenares, musgo, samambaias e raios de sol.',
  defaultTime: 'amanhecer',
  presets: PRESETS,
  build,
};
