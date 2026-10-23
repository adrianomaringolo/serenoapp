// Cerejeiras (sakura):
//  - createSakura: a Somei-Yoshino — tronco curto e escuro que se abre em
//    poucos galhos grossos, quase na horizontal, e uma copa larga e baixa de
//    "nuvens" de flor. Cada nuvem é um volume rosado coberto de cachos de flores
//    (cartões com recorte); por baixo, os galhos escuros aparecem.
//  - createWeepingSakura: a shidare-zakura, velha, com galhos em arco dos quais
//    pendem cortinas de raminhos floridos (e muletas de madeira segurando os
//    galhos mais compridos, como nos templos).
//  - createPetalFall: as pétalas que se soltam das copas, caem girando, pousam
//    no chão (e somem devagar) ou na água (e descem a correnteza).
//  - createPetalRafts: o tapete de pétalas boiando no canal (hanaikada), que
//    escorre devagar e se estica em faixas, mais lento junto às margens.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, smoothstep, clamp } from '../core/noise.js';
import { applyWind, globalUniforms, leafDepthMaterial } from '../core/materials.js';
import { sakuraBlossomTexture, sakuraPetalTexture, sakuraStrandTexture, sakuraBarkTextures } from '../core/textures.js';
import { taperedTube } from './trees.js';
import { strandGeometry, archCurve } from './willow.js';

globalUniforms.uLeafGlow ??= { value: 0.1 };

// As flores são finas: com sol atrás, a luz atravessa (o mesmo uLeafGlow das folhas).
function glowing(m, k) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uLeafGlow = globalUniforms.uLeafGlow;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLeafGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uLeafGlow * ${k.toFixed(2)};`);
  };
  const prevKey = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}-glow${k}`;
  return m;
}

// copa: os cachos balançam juntos, devagar
const CROWN_WIND = { mode: 'world', base: 1.5, height: 6, amp: 0.035, flutter: 0.006 };

let SK = null;
export function sakuraKit() {
  if (SK) return SK;
  const bark = sakuraBarkTextures(512, 256);
  const blossom = sakuraBlossomTexture(256);
  const strand = sakuraStrandTexture(64, 512);
  SK = {
    blossom, strand,
    petalTex: sakuraPetalTexture(64),
    bark: new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.72 }),
    flowers: glowing(applyWind(new THREE.MeshStandardMaterial({ map: blossom, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }), CROWN_WIND), 1.8),
    flowersDepth: leafDepthMaterial(blossom, CROWN_WIND),
    // um cartão para todas as árvores: o mergeInstanced junta a avenida inteira
    card: new THREE.PlaneGeometry(0.34, 0.34),
  };
  globalThis.__sakuraFlowers = SK.flowers; // usado pelo scripts/bench.js
  return SK;
}

function randomUnit(R) {
  const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a));
}

// Tufos de flor: em volta de cada ponta de raminho, cachos espalhados num
// volume (mais na casca do que no miolo), virados para fora. Os de baixo e os
// de dentro ficam mais escuros, como a sombra dentro de uma copa de verdade.
export function fillClumps(tips, perTip, R, tints, { scale = 1 } = {}) {
  const sk = sakuraKit();
  const count = tips.length * perTip;
  const inst = new THREE.InstancedMesh(sk.card, sk.flowers, count);
  inst.customDepthMaterial = sk.flowersDepth;
  inst.castShadow = true;
  inst.receiveShadow = true;
  const p = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Quaternion(), tw = new THREE.Quaternion();
  const m4 = new THREE.Matrix4(), s = new THREE.Vector3(), col = new THREE.Color();
  const Z = new THREE.Vector3(0, 0, 1);
  let i = 0;
  for (const tp of tips) {
    for (let k = 0; k < perTip; k++) {
      const dir = randomUnit(R);
      dir.y = dir.y * 0.7 + 0.12;
      const shell = 0.45 + 0.55 * Math.sqrt(R());
      p.copy(tp.p).addScaledVector(dir, tp.r * shell * 1.25);
      n.copy(dir).addScaledVector(randomUnit(R), 0.6).normalize();
      q.setFromUnitVectors(Z, n);
      tw.setFromAxisAngle(Z, R() * Math.PI * 2);
      q.multiply(tw);
      m4.compose(p, q, s.setScalar((0.75 + R() * 0.5) * scale));
      inst.setMatrixAt(i, m4);
      col.setHex(tints[Math.floor(R() * tints.length)]).multiplyScalar(0.92 + R() * 0.1);
      col.multiplyScalar((0.62 + 0.38 * shell) * (0.78 + 0.22 * smoothstep(-0.7, 0.6, dir.y)));
      inst.setColorAt(i++, col);
    }
  }
  return inst;
}

// Volume invisível que recebe o clique (sacudir a árvore). Não entra no bakeStatic.
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
function hitProxy(box) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), hitMat);
  box.getCenter(m.position);
  box.getSize(m.scale);
  m.scale.multiplyScalar(0.92);
  m.userData.keep = true;
  return m;
}

// ---------------------------------------------------------------------------
// Somei-Yoshino
// ---------------------------------------------------------------------------
export const YOSHINO = [0xfde4ec, 0xf9dbe5, 0xffeef3, 0xf6d3df];
export const YAE = [0xf6b9cb, 0xf3a8bf, 0xf9c8d5, 0xeea0b6];

// lean: ângulo (radianos, no plano xz) para onde a árvore se debruça; leanAmount 0–1
// trunk: altura do tronco (as das avenidas são podadas altas, para se passar por baixo);
// rise: quanto os galhos grandes sobem antes de abrir
export function createSakura(seed = 1, { size = 1, lean = null, leanAmount = 0, tints = YOSHINO, density = 1, trunk: trunkH = null, rise = 0.75 } = {}) {
  const sk = sakuraKit();
  const R = rng(seed * 7 + 3);
  const geos = [];
  const tips = [];
  const up = new THREE.Vector3(0, 1, 0);
  const leanDir = lean == null ? null : new THREE.Vector3(Math.cos(lean), 0, Math.sin(lean));

  // tronco curto, grosso e um pouco torto
  const th = trunkH ?? 1.5 + R() * 0.6;
  const lx = leanDir ? leanDir.x * leanAmount * 0.7 : (R() - 0.5) * 0.3;
  const lz = leanDir ? leanDir.z * leanAmount * 0.7 : (R() - 0.5) * 0.3;
  const trunk = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.2, 0),
    new THREE.Vector3(lx * 0.15 + (R() - 0.5) * 0.12, th * 0.4, lz * 0.15 + (R() - 0.5) * 0.12),
    new THREE.Vector3(lx * 0.55, th * 0.78, lz * 0.55),
    new THREE.Vector3(lx, th, lz),
  ]);
  geos.push(taperedTube(trunk, 18, 14, 0.3, 0.2, 1.1));

  // galhos: tortuosos, abrindo para fora quase na horizontal; os raminhos das
  // pontas (níveis 3 e 4) carregam os tufos de flor
  const MAX = 4;
  function grow(p0, dir, len, r0, depth) {
    const pts = [p0.clone()];
    const p = p0.clone(), d = dir.clone();
    for (let k = 1; k <= 4; k++) {
      d.addScaledVector(randomUnit(R), 0.2 + depth * 0.07);
      // as pontas longas pendem um pouco com o peso das flores
      d.y -= (depth === 0 ? 0.05 : 0.08) * k / 4;
      if (depth === 0) d.y = Math.max(d.y, 0.25);
      d.normalize();
      p.addScaledVector(d, len / 4);
      pts.push(p.clone());
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const r1 = r0 * (depth === 0 ? 0.5 : 0.5);
    // os raminhos da ponta ficam escondidos nos tufos: sem tubo (viravam palitos pretos)
    if (depth < MAX) geos.push(taperedTube(curve, depth === 0 ? 16 : depth < 2 ? 9 : 4, depth === 0 ? 11 : depth < 2 ? 7 : 4, r0, r1, depth === 0 ? 0.25 : 0));
    if (depth >= 2) {
      for (const t of depth === MAX ? [0.45, 1] : [0.55]) tips.push({ p: curve.getPointAt(t), r: (depth === MAX ? 0.3 : 0.36) + R() * 0.1 });
    }
    if (depth >= MAX) return;
    const n = depth === 0 ? 3 : 2 + (R() < (depth >= 2 ? 0.35 : 0.5) ? 1 : 0);
    for (let c = 0; c < n; c++) {
      const t = depth === 0 ? 0.42 + (c / n) * 0.5 + R() * 0.08 : 0.4 + R() * 0.6;
      const start = curve.getPointAt(Math.min(1, t));
      const tan = curve.getTangentAt(Math.min(1, t));
      const ang = R() * Math.PI * 2;
      const side = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      const horiz = new THREE.Vector3(start.x - lx, 0, start.z - lz);
      if (horiz.lengthSq() > 0.01) horiz.normalize();
      const cd = tan.clone().multiplyScalar(0.6).addScaledVector(side, 0.55).addScaledVector(horiz, 0.45);
      cd.y = clamp(cd.y, depth < 1 ? 0.12 : depth < 2 ? 0.02 : -0.2, 0.6);
      grow(start, cd.normalize(), len * (0.62 + R() * 0.14), Math.max(0.012, r1 * (1 - t * 0.25)), depth + 1);
    }
  }
  const nL = 3 + (R() < 0.6 ? 1 : 0) + (R() < 0.25 ? 1 : 0);
  const a0 = R() * Math.PI * 2;
  for (let i = 0; i < nL; i++) {
    const a = a0 + (i / nL) * Math.PI * 2 + (R() - 0.5) * 0.7;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    if (leanDir) out.lerp(leanDir, leanAmount * 0.55).normalize();
    const dir = out.clone().addScaledVector(up, rise + R() * 0.5).normalize();
    grow(trunk.getPointAt(0.8 + R() * 0.2), dir, 3.2 + R() * 1.1, 0.16, 0);
  }

  const wood = new THREE.Mesh(mergeGeometries(geos), sk.bark);
  wood.castShadow = wood.receiveShadow = true;

  // tufos de flor sobre as pontas
  const flowers = fillClumps(tips, Math.max(4, Math.round(40 * density)), R, tints);

  const group = new THREE.Group();
  group.add(wood, flowers);
  const box = new THREE.Box3();
  for (const tp of tips) box.expandByPoint(tp.p);
  box.expandByScalar(0.4);
  box.min.y = Math.min(box.min.y, th * 0.6);
  group.add(hitProxy(box));
  group.scale.setScalar(size);
  group.userData.radius = 1.2 * size;
  return { group, tips: tips.map((t) => ({ p: t.p.clone().multiplyScalar(size), r: t.r * size })), box: box.clone().applyMatrix4(new THREE.Matrix4().makeScale(size, size, size)) };
}

// ---------------------------------------------------------------------------
// Shidare-zakura (cerejeira-chorona)
// ---------------------------------------------------------------------------
export function createWeepingSakura(seed = 1, { size = 1, strands = 2600, groundAt = () => 0 } = {}) {
  const sk = sakuraKit();
  const R = rng(seed * 13 + 1);
  const group = new THREE.Group();
  const wood = [];
  const attach = [];
  const tips = [];

  // tronco velho e grosso, torcido, com raízes que agarram o chão
  const trunk = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.3, 0),
    new THREE.Vector3(0.25, 1.2, 0.1),
    new THREE.Vector3(-0.05, 2.4, 0.25),
    new THREE.Vector3(0.15, 3.4, 0.05),
  ]);
  wood.push(taperedTube(trunk, 26, 18, 0.62, 0.36, 1.2));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + R() * 0.5;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const end = out.clone().multiplyScalar(1.2 + R() * 0.5);
    end.y = groundAt(end.x * size, end.z * size) / size - 0.15;
    wood.push(taperedTube(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.6, 0).addScaledVector(out, 0.2),
      new THREE.Vector3(0, 0.15, 0).addScaledVector(out, 0.7),
      end,
    ]), 8, 8, 0.24, 0.06));
  }

  // galhos em fonte: sobem, abrem e se curvam até quase o chão
  const top = trunk.getPointAt(1);
  const nMain = 6 + Math.floor(R() * 2);
  const props = [];
  for (let i = 0; i < nMain; i++) {
    const a = (i / nMain) * Math.PI * 2 + R() * 0.5;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const main = archCurve(trunk.getPointAt(0.7 + R() * 0.3), dir, 5.2 + R() * 2, 1.6 + R() * 0.8, 2.3 + R() * 0.6, R);
    wood.push(taperedTube(main, 22, 10, 0.2, 0.03));
    for (let m = 0; m < 18; m++) attach.push({ curve: main, t: 0.15 + (m / 18) * 0.85 });
    for (let k = 0; k < 3; k++) {
      const t = 0.3 + k * 0.2 + R() * 0.08;
      const side = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (R() - 0.5) * 1.9);
      const sub = archCurve(main.getPointAt(t), side, 2 + R() * 1.4, 1.2, 1.9, R);
      wood.push(taperedTube(sub, 10, 6, 0.06, 0.012));
      for (let m = 0; m < 10; m++) attach.push({ curve: sub, t: 0.2 + (m / 10) * 0.8 });
      tips.push({ p: sub.getPointAt(0.5), r: 0.6 });
    }
    // os galhos mais longos ganham uma muleta de madeira
    if (i % 2 === 0) props.push(main.getPointAt(0.55));
  }
  for (let i = 0; i < 3; i++) {
    const a = R() * Math.PI * 2;
    const lead = archCurve(top, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 4 + R() * 1.5, 4.5, 1.4, R);
    wood.push(taperedTube(lead, 14, 8, 0.14, 0.02));
    for (let m = 0; m < 22; m++) attach.push({ curve: lead, t: 0.12 + (m / 22) * 0.88, short: true });
    tips.push({ p: lead.getPointAt(0.45), r: 0.9 });
  }
  const woodMesh = new THREE.Mesh(mergeGeometries(wood), sk.bark);
  woodMesh.castShadow = woodMesh.receiveShadow = true;
  group.add(woodMesh);

  // muletas: poste com forquilha e amarração
  const propGeos = [];
  for (const p of props) {
    const gy = groundAt(p.x * size, p.z * size) / size;
    const h = p.y - gy;
    propGeos.push(new THREE.CylinderGeometry(0.05, 0.065, h, 7).translate(p.x, gy + h / 2 - 0.05, p.z));
    for (const s of [-1, 1]) {
      const fork = new THREE.CylinderGeometry(0.03, 0.04, 0.45, 6);
      fork.rotateZ(s * 0.5).translate(p.x + s * 0.1, p.y - 0.12, p.z);
      propGeos.push(fork);
    }
    propGeos.push(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8).translate(p.x, p.y - 0.32, p.z));
  }
  if (propGeos.length) {
    const pm = new THREE.Mesh(mergeGeometries(propGeos.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.9 }));
    pm.castShadow = true;
    group.add(pm);
  }

  // cortinas de raminhos floridos
  const tex = sk.strand;
  const mat = glowing(applyWind(new THREE.MeshStandardMaterial({
    map: tex, vertexColors: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7,
  }), { mode: 'hang', height: 1, amp: 0.3, power: 1.5, flutter: 0.015 }), 1.4);
  const mesh = new THREE.InstancedMesh(strandGeometry(8, [0xf2d4dc, 0xffffff]), mat, strands);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < strands; i++) {
    const a = attach[Math.floor(R() * attach.length)];
    a.curve.getPointAt(Math.min(1, a.t + (R() - 0.5) * 0.08), p);
    p.x += (R() - 0.5) * 0.3; p.z += (R() - 0.5) * 0.3; p.y += (R() - 0.5) * 0.12;
    const gy = groundAt(p.x * size, p.z * size) / size;
    // comprimentos bem variados: a cortina tem franja e janelas para o céu
    const len = a.short && R() < 0.7 ? 0.6 + R() * 1.4 : Math.max(0.6, (p.y - gy - 0.4) * (0.35 + 0.65 * Math.pow(R(), 0.6)));
    const outward = Math.atan2(p.x - top.x, p.z - top.z) + (R() - 0.5) * 0.9;
    q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.15, outward, (R() - 0.5) * 0.15, 'YXZ'));
    m4.compose(p, q, s.set(1 + R() * 0.5, len, 0.8 + R() * 0.5));
    mesh.setMatrixAt(i, m4);
    col.setHex(YAE[Math.floor(R() * YAE.length)]).lerp(new THREE.Color(1, 1, 1), 0.35 + R() * 0.3);
    mesh.setColorAt(i, col);
  }
  group.add(mesh);

  // o alto da copa: algumas nuvens de flor sobre os galhos guia
  group.add(fillClumps(tips, 76, R, YAE));

  const box = new THREE.Box3().setFromObject(woodMesh);
  box.min.y = 1.2;
  group.add(hitProxy(box));
  group.scale.setScalar(size);
  group.userData.radius = 2 * size;
  return {
    group,
    tips: attach.filter((_, i) => i % 3 === 0).map((a) => ({ p: a.curve.getPointAt(a.t).multiplyScalar(size), r: 0.4 * size })),
    box: box.clone().applyMatrix4(new THREE.Matrix4().makeScale(size, size, size)),
  };
}

// ---------------------------------------------------------------------------
// Pétalas caindo
// ---------------------------------------------------------------------------
// sources: [{ x, y, z, r }] no mundo (pontos das copas). groundAt(x, z) → y do
// chão; waterAt(x, z) → nível da água ali (ou -Infinity); flow(x, z, out) →
// correnteza { x, z } em m/s.
export function createPetalFall({ count = 900, sources, groundAt, waterAt = () => -Infinity, flow = null, seed = 3 }) {
  const sk = sakuraKit();
  const R = rng(seed);
  const geo = new THREE.PlaneGeometry(0.045, 0.05, 1, 2);
  // pétala em concha: as bordas sobem um pouco
  {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.abs(pos.getX(i)) * 0.4 - pos.getY(i) * pos.getY(i) * 3);
    geo.computeVertexNormals();
  }
  const mat = glowing(new THREE.MeshStandardMaterial({ map: sk.petalTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7 }), 1.5);
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.userData.keep = true;
  const col = new THREE.Color();
  const P = [];
  for (let i = 0; i < count; i++) {
    mesh.setColorAt(i, col.setHex(YOSHINO[i % YOSHINO.length]).multiplyScalar(0.9 + R() * 0.1));
    P.push({ state: 0, p: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), phase: R() * 10, t: 0, fall: 0.4 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, zero);
  let cursor = 0;
  const fl = { x: 0, z: 0 };

  function emit(src, burst = false) {
    for (let k = 0; k < count; k++) {
      const f = P[cursor];
      cursor = (cursor + 1) % count;
      if (f.state === 1 && !burst) continue;
      const d = randomUnit(R);
      f.p.set(src.x + d.x * src.r, src.y + d.y * src.r * 0.5, src.z + d.z * src.r);
      f.rot.set(R() * 6, R() * 6, R() * 6);
      f.spin.set((R() - 0.5) * 5, (R() - 0.5) * 3, (R() - 0.5) * 5);
      f.fall = 0.32 + R() * 0.22;
      f.vx = burst ? d.x * (0.6 + R() * 0.8) : 0;
      f.vz = burst ? d.z * (0.6 + R() * 0.8) : 0;
      f.state = 1;
      f.t = 0;
      return;
    }
  }

  // de onde caem: as copas perto da câmera (atualizado de vez em quando)
  let near = sources;
  let acc = 0, refresh = 0;
  function update(dt, t, camera, { rate = 40, wind = 1, windDir = 0.6 } = {}) {
    refresh -= dt;
    if (refresh <= 0) {
      refresh = 1;
      const c = camera.position;
      near = sources.filter((s) => (s.x - c.x) ** 2 + (s.z - c.z) ** 2 < 32 * 32);
      if (!near.length) near = sources;
    }
    acc += dt * rate * (0.4 + wind);
    while (acc >= 1) { acc -= 1; emit(near[Math.floor(R() * near.length)]); }
    const wx = Math.cos(windDir) * (0.15 + wind * 0.45), wz = Math.sin(windDir) * (0.15 + wind * 0.45);
    for (let i = 0; i < count; i++) {
      const f = P[i];
      if (f.state === 0) continue;
      f.t += dt;
      let sc = 1;
      if (f.state === 1) {
        // cai girando, levada pela brisa, num zigue-zague lento
        f.vx *= 1 - dt * 1.5; f.vz *= 1 - dt * 1.5;
        f.p.y -= dt * f.fall * (1 + 0.35 * Math.sin(t * 2.3 + f.phase));
        f.p.x += dt * (wx + f.vx + Math.sin(t * 1.4 + f.phase) * 0.35);
        f.p.z += dt * (wz + f.vz + Math.cos(t * 1.1 + f.phase * 1.3) * 0.3);
        f.rot.x += f.spin.x * dt; f.rot.y += f.spin.y * dt; f.rot.z += f.spin.z * dt;
        const w = waterAt(f.p.x, f.p.z), g = groundAt(f.p.x, f.p.z);
        if (w > g && f.p.y <= w + 0.004) {
          f.state = 3; f.t = 0; f.p.y = w + 0.004;
          f.rot.set(-Math.PI / 2, f.rot.y, 0);
        } else if (f.p.y <= g + 0.01) {
          f.state = 2; f.t = 0; f.p.y = g + 0.01;
          f.rot.set(-Math.PI / 2 + (R() - 0.5) * 0.4, f.rot.y, (R() - 0.5) * 0.4);
        } else if (f.t > 40) f.state = 0;
      } else if (f.state === 2) {
        sc = 1 - smoothstep(10, 14, f.t);
        if (f.t > 14) f.state = 0;
      } else {
        // boiando: desce com a água e some devagar
        if (flow) {
          flow(f.p.x, f.p.z, fl);
          f.p.x += fl.x * dt; f.p.z += fl.z * dt;
        }
        f.rot.y += dt * 0.1;
        sc = 1 - smoothstep(18, 25, f.t);
        if (f.t > 25) f.state = 0;
      }
      if (f.state === 0) { mesh.setMatrixAt(i, zero); continue; }
      q.setFromEuler(f.rot);
      mesh.setMatrixAt(i, m4.compose(f.p, q, s.setScalar(sc)));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // sacudir uma árvore: uma chuva de pétalas de uma vez
  function burst(list, n = 160) {
    for (let k = 0; k < n; k++) emit(list[Math.floor(R() * list.length)], true);
  }

  return { mesh, update, burst };
}

// ---------------------------------------------------------------------------
// Pétalas boiando no canal (hanaikada)
// ---------------------------------------------------------------------------
// sample(s) → { x, z, dx, dz, hw } ao longo do canal (s em metros, 0..length);
// a água corre no sentido de s crescente.
export function createPetalRafts({ count = 3000, length, sample, level = 0, speed = 0.12, seed = 9 }) {
  const sk = sakuraKit();
  const R = rng(seed);
  const geo = new THREE.PlaneGeometry(0.05, 0.055).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: sk.petalTex, alphaTest: 0.4, roughness: 0.6 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.userData.keep = true;
  const col = new THREE.Color();
  const S = new Float32Array(count), U = new Float32Array(count), ROT = new Float32Array(count), SC = new Float32Array(count);
  // em manchas (jangadas) e faixas, com algumas soltas entre elas
  const clumps = Array.from({ length: Math.round(length / 3) }, () => ({ s: R() * length, u: (R() - 0.5) * 1.4, w: 0.5 + R() * 1.6 }));
  for (let i = 0; i < count; i++) {
    if (R() < 0.8) {
      const c = clumps[Math.floor(R() * clumps.length)];
      const g = () => (R() + R() + R() - 1.5) / 1.5;
      S[i] = (c.s + g() * c.w * 1.6 + length) % length;
      U[i] = clamp(c.u + g() * c.w * 0.35, -0.95, 0.95);
    } else {
      S[i] = R() * length;
      U[i] = (R() * 2 - 1) * 0.95;
    }
    ROT[i] = R() * Math.PI * 2;
    SC[i] = 0.8 + R() * 0.5;
    mesh.setColorAt(i, col.setHex(YOSHINO[i % YOSHINO.length]).multiplyScalar(0.85 + R() * 0.12));
  }
  const arr = mesh.instanceMatrix.array;
  function update(dt) {
    for (let i = 0; i < count; i++) {
      const u = U[i];
      // mais lento junto às paredes: as jangadas se esticam em faixas
      S[i] += dt * speed * (1 - 0.65 * u * u);
      if (S[i] > length) S[i] -= length;
      const c = sample(S[i]);
      const x = c.x - c.dz * u * c.hw, z = c.z + c.dx * u * c.hw;
      ROT[i] += dt * 0.04 * u;
      const fade = smoothstep(0, 3, S[i]) * smoothstep(length, length - 3, S[i]);
      const k = SC[i] * fade, cs = Math.cos(ROT[i]) * k, sn = Math.sin(ROT[i]) * k;
      const o = i * 16;
      arr[o] = cs; arr[o + 1] = 0; arr[o + 2] = -sn; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = k; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = sn; arr[o + 9] = 0; arr[o + 10] = cs; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = level + 0.006; arr[o + 14] = z; arr[o + 15] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { mesh, update };
}
