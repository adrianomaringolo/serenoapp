// Peças do hanami (a festa de olhar as cerejeiras):
//  - bonbori: lanterna de papel num poste, das que iluminam as flores à noite
//  - torii: o portal vermelho do santuário
//  - ponte em arco laqueada, com corrimão e as "giboshi" de bronze nos postes
//  - mōsen: tapete vermelho de piquenique com bandeja de chá e dango
//  - nodate-gasa: o grande guarda-sol de papel vermelho da cerimônia do chá ao ar livre
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../core/noise.js';
import { bakeGroup, paintGeometry } from '../core/materials.js';
import { lanternHalo } from './lantern.js';
import { paperGlow } from './boat.js';
import { createFlame } from './candle.js';
import { getKit } from './kit.js';

export const vermilion = new THREE.MeshPhysicalMaterial({ color: 0xb8321e, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.4 });
const lacquerBlack = new THREE.MeshPhysicalMaterial({ color: 0x1a1412, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x3a281c, roughness: 0.8 });
const bronze = new THREE.MeshStandardMaterial({ color: 0x6a5a34, metalness: 0.7, roughness: 0.45 });
const felt = new THREE.MeshStandardMaterial({ color: 0xa8231c, roughness: 1 });
const ceramic = new THREE.MeshPhysicalMaterial({ color: 0x5d6b5a, roughness: 0.35, clearcoat: 0.6 });
const cupMat = new THREE.MeshPhysicalMaterial({ color: 0xe9e1d0, roughness: 0.3, clearcoat: 0.5 });
const parasolPaper = new THREE.MeshStandardMaterial({ color: 0xb52a1e, roughness: 0.85, side: THREE.DoubleSide, emissive: 0x3a0804, emissiveIntensity: 0.3 });

function ensurePaper() {
  const kit = getKit();
  if (!paperGlow.map) { paperGlow.map = kit.washi; paperGlow.emissiveMap = kit.washi; paperGlow.needsUpdate = true; }
}

// ---------------------------------------------------------------------------
// Bonbori: poste quadrado, caixa hexagonal de papel, chapéu e uma luz quente.
// ---------------------------------------------------------------------------
export function createBonbori(seed = 1, { height = 1.45, light = true } = {}) {
  ensurePaper();
  const R = rng(seed * 3 + 1);
  const group = new THREE.Group();
  const kit = getKit();
  const foot = new THREE.Mesh(paintGeometry(new THREE.CylinderGeometry(0.16, 0.2, 0.14, 6).toNonIndexed(), 0x77736b), kit.stoneFine);
  foot.position.y = 0.05;
  foot.castShadow = foot.receiveShadow = true;
  group.add(foot);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.07, height, 0.07), darkWood);
  pole.position.y = height / 2 + 0.1;
  pole.castShadow = true;
  group.add(pole);
  // caixa de papel: hexágono um pouco mais largo em cima
  const r = 0.17, h = 0.44, y0 = height + 0.08;
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r, h, 6, 1, true), paperGlow);
  paper.position.y = y0 + h / 2;
  group.add(paper);
  const frame = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    frame.push(new THREE.BoxGeometry(0.018, h + 0.02, 0.018).translate(Math.cos(a) * r * 1.03, y0 + h / 2, Math.sin(a) * r * 1.03));
  }
  frame.push(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.03, 6).translate(0, y0, 0));
  frame.push(new THREE.CylinderGeometry(r * 1.1, r * 1.1, 0.025, 6).translate(0, y0 + h, 0));
  const fm = new THREE.Mesh(mergeGeometries(frame.map((g) => g.toNonIndexed())), darkWood);
  fm.castShadow = true;
  group.add(fm);
  // chapéu de seis águas e o botão no topo
  const hat = new THREE.Mesh(new THREE.ConeGeometry(r * 1.55, 0.16, 6), lacquerBlack);
  hat.position.y = y0 + h + 0.09;
  hat.castShadow = true;
  group.add(hat);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), bronze);
  knob.position.y = y0 + h + 0.19;
  group.add(knob);
  const flame = createFlame();
  flame.userData.keep = true;
  flame.position.y = y0 + 0.08;
  flame.scale.setScalar(1.4);
  group.add(flame);
  const halo = new THREE.Sprite(lanternHalo);
  halo.position.y = y0 + h / 2;
  halo.scale.setScalar(1.7);
  halo.raycast = () => {};
  group.add(halo);
  bakeGroup(group);
  group.rotation.y = R() * Math.PI;
  group.userData.radius = 0.32;
  group.userData.material = 'wood';
  if (light) group.userData.lights = [{ offset: new THREE.Vector3(0, y0 + h / 2, 0), color: 0xffb066, intensity: 3.2, distance: 9, flicker: true, day: 0.05 }];
  group.userData.lightY = y0 + h / 2;
  return group;
}

// ---------------------------------------------------------------------------
// Torii (estilo myōjin): kasagi preto com as pontas erguidas, nuki atravessando
// as colunas e a plaquinha no meio.
// ---------------------------------------------------------------------------
function curvedBeam(len, h, d, lift, seg = 24) {
  const g = new THREE.BoxGeometry(len, h, d, seg, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (len / 2);
    pos.setY(i, pos.getY(i) + lift * Math.pow(Math.abs(x), 2.4));
  }
  g.computeVertexNormals();
  return g;
}

export function createTorii({ span = 3.4, height = 4.2 } = {}) {
  const group = new THREE.Group();
  const red = [], black = [];
  for (const s of [-1, 1]) {
    // colunas levemente inclinadas para dentro
    const col = new THREE.CylinderGeometry(0.17, 0.21, height, 18);
    col.translate(0, height / 2, 0);
    col.rotateZ(s * 0.025);
    col.translate(s * span / 2, 0, 0);
    red.push(col);
    black.push(new THREE.CylinderGeometry(0.27, 0.29, 0.42, 18).translate(s * span / 2, 0.15, 0));
  }
  red.push(new THREE.BoxGeometry(span + 0.9, 0.2, 0.2).translate(0, height * 0.76, 0)); // nuki
  red.push(curvedBeam(span + 1.7, 0.2, 0.32, 0.18).translate(0, height - 0.02, 0)); // shimaki
  red.push(new THREE.BoxGeometry(0.18, height * 0.22, 0.16).translate(0, height * 0.87, 0)); // gakuzuka
  black.push(curvedBeam(span + 2.2, 0.24, 0.42, 0.36).translate(0, height + 0.2, 0)); // kasagi
  black.push(new THREE.BoxGeometry(0.62, 0.5, 0.06).translate(0, height * 0.87, 0.1)); // gaku
  const flat = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
  const r = new THREE.Mesh(flat(red), vermilion);
  const b = new THREE.Mesh(flat(black), lacquerBlack);
  for (const m of [r, b]) { m.castShadow = m.receiveShadow = true; group.add(m); }
  return group;
}

// ---------------------------------------------------------------------------
// Ponte em arco sobre o canal. Ao longo do eixo x local, de -span/2 a +span/2;
// o piso sobe `rise` no meio. deckY(lx) dá a altura do piso (para caminhar).
// ---------------------------------------------------------------------------
export function createArchBridge({ span = 6, width = 1.6, rise = 0.55, seed = 2 } = {}) {
  const kit = getKit();
  const R = rng(seed);
  const group = new THREE.Group();
  const deckY = (lx) => rise * (1 - Math.pow((2 * lx) / span, 2));
  const slope = (lx) => (-8 * rise * lx) / (span * span);
  const planks = [];
  const n = Math.round(span / 0.2);
  for (let i = 0; i < n; i++) {
    const x = -span / 2 + (i + 0.5) * (span / n);
    const g = new THREE.BoxGeometry(span / n - 0.015, 0.07, width * (0.98 + R() * 0.04));
    g.rotateZ(Math.atan(slope(x)));
    g.translate(x, deckY(x) - 0.035, 0);
    planks.push(g);
  }
  const deck = new THREE.Mesh(mergeGeometries(planks), kit.woodMat);
  deck.castShadow = deck.receiveShadow = true;
  group.add(deck);
  // vigas laterais em arco (laqueadas), por baixo do piso
  const red = [];
  for (const z of [-width / 2 + 0.06, width / 2 - 0.06]) {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const x = -span / 2 - 0.2 + (i / 16) * (span + 0.4); pts.push(new THREE.Vector3(x, deckY(x) - 0.14, z)); }
    red.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.1, 6));
  }
  // corrimão: postes, dois corrimãos em arco e as giboshi
  const bronzeG = [];
  const posts = 5;
  for (const z of [-width / 2, width / 2]) {
    for (let i = 0; i <= posts; i++) {
      const x = -span / 2 + 0.15 + (i / posts) * (span - 0.3);
      const y = deckY(x);
      red.push(new THREE.BoxGeometry(0.11, 0.85, 0.11).translate(x, y + 0.4, z));
      if (i === 0 || i === posts) {
        bronzeG.push(new THREE.SphereGeometry(0.075, 12, 8).scale(1, 1.25, 1).translate(x, y + 0.9, z));
        bronzeG.push(new THREE.ConeGeometry(0.035, 0.12, 10).translate(x, y + 1.02, z));
      }
    }
    for (const hy of [0.78, 0.42]) {
      const pts = [];
      for (let i = 0; i <= 16; i++) { const x = -span / 2 + 0.15 + (i / 16) * (span - 0.3); pts.push(new THREE.Vector3(x, deckY(x) + hy, z)); }
      red.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, hy > 0.6 ? 0.045 : 0.03, 6));
    }
  }
  const flat = (list) => mergeGeometries(list.map((g) => { const h = g.index ? g.toNonIndexed() : g; h.deleteAttribute('uv'); return h; }));
  const rm = new THREE.Mesh(flat(red), vermilion);
  rm.castShadow = rm.receiveShadow = true;
  const bm = new THREE.Mesh(flat(bronzeG), bronze);
  bm.castShadow = true;
  group.add(rm, bm);
  return { group, deckY, span, width };
}

// ---------------------------------------------------------------------------
// Mōsen: tapete de feltro vermelho, bandeja laqueada com bule e duas xícaras,
// e um pratinho de hanami dango (rosa, branco e verde).
// ---------------------------------------------------------------------------
const dangoMats = [0xf2a7b8, 0xf6f0e4, 0x9cb86a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
export function createMosen(seed = 1) {
  const R = rng(seed * 11 + 5);
  const group = new THREE.Group();
  const W = 1.5, D = 1.0;
  const mat = new THREE.BoxGeometry(W, 0.02, D, 12, 1, 8);
  {
    // um pouco amarrotado
    const pos = mat.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, pos.getY(i) + Math.sin(x * 5 + seed) * Math.cos(z * 4) * 0.006);
    }
    mat.computeVertexNormals();
  }
  const m = new THREE.Mesh(mat, felt);
  m.position.y = 0.012;
  m.receiveShadow = true;
  group.add(m);
  // bandeja
  const tray = new THREE.Group();
  const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.3), lacquerBlack);
  t.position.y = 0.035;
  tray.add(t);
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12).scale(1, 0.85, 1), ceramic);
  pot.position.set(-0.1, 0.105, 0);
  tray.add(pot);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), ceramic);
  lid.position.set(-0.1, 0.17, 0);
  tray.add(lid);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.07, 6), ceramic);
  spout.rotation.z = -1;
  spout.position.set(-0.035, 0.11, 0);
  tray.add(spout);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6), darkWood);
  handle.rotation.x = Math.PI / 2;
  handle.rotation.y = 0.6;
  handle.position.set(-0.16, 0.12, 0.04);
  tray.add(handle);
  for (const [x, z] of [[0.08, -0.07], [0.13, 0.06]]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.055, 14), cupMat);
    cup.position.set(x, 0.075, z);
    tray.add(cup);
  }
  for (const o of tray.children) o.castShadow = true;
  tray.position.set(-0.3, 0, -0.1);
  tray.rotation.y = (R() - 0.5) * 0.5;
  group.add(tray);
  // dango: três espetinhos num pratinho
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.015, 18), cupMat);
  plate.position.set(0.35, 0.03, 0.15);
  group.add(plate);
  for (let k = 0; k < 3; k++) {
    const stick = new THREE.Group();
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.17, 4), darkWood);
    s.rotation.z = Math.PI / 2;
    stick.add(s);
    dangoMats.forEach((dm, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), dm);
      b.position.x = -0.04 + i * 0.038;
      b.castShadow = true;
      stick.add(b);
    });
    stick.position.set(0.35, 0.055, 0.12 + k * 0.03);
    stick.rotation.y = 0.3 + (R() - 0.5) * 0.2;
    group.add(stick);
  }
  group.rotation.y = R() * Math.PI;
  group.userData.radius = 0.9;
  group.userData.material = 'wood';
  return group;
}

// ---------------------------------------------------------------------------
// Nodate-gasa: guarda-sol grande de papel vermelho, varetas de bambu à mostra
// por baixo, fincado no chão.
// ---------------------------------------------------------------------------
export function createParasol(seed = 1) {
  const R = rng(seed * 5 + 2);
  const group = new THREE.Group();
  const H = 2.3, Rr = 1.25, ribs = 32;
  const tilt = 0.12 + R() * 0.1;
  const head = new THREE.Group();
  // cobertura: cone raso com ondinhas entre as varetas
  const g = new THREE.ConeGeometry(Rr, 0.5, ribs * 2, 4, true);
  {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
      const a = Math.atan2(z, x);
      pos.setY(i, pos.getY(i) - Math.cos(a * ribs) * 0.012 * (r / Rr));
    }
    g.computeVertexNormals();
  }
  const canopy = new THREE.Mesh(g, parasolPaper);
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  head.add(canopy);
  // anel branco perto da borda (como nos de verdade)
  const ring = new THREE.Mesh(new THREE.ConeGeometry(Rr * 0.32, 0.13, ribs * 2, 1, true).translate(0, 0.19, 0), new THREE.MeshStandardMaterial({ color: 0xe9dcc8, roughness: 0.9, side: THREE.DoubleSide }));
  ring.scale.setScalar(1.01);
  head.add(ring);
  const ribG = [];
  for (let k = 0; k < ribs; k++) {
    const a = (k / ribs) * Math.PI * 2;
    const rib = new THREE.CylinderGeometry(0.005, 0.005, Rr * 0.75, 3);
    rib.rotateZ(Math.PI / 2 - Math.atan2(0.62, 1));
    rib.translate(Rr * 0.32, -0.32, 0);
    rib.rotateY(a);
    ribG.push(rib.toNonIndexed());
  }
  const ribs3 = new THREE.Mesh(mergeGeometries(ribG), new THREE.MeshStandardMaterial({ color: 0xc8b58a, roughness: 0.8 }));
  head.add(ribs3);
  head.position.y = H;
  head.rotation.z = tilt;
  group.add(head);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, H + 0.25, 8), new THREE.MeshStandardMaterial({ color: 0xb29a62, roughness: 0.7 }));
  pole.position.y = (H + 0.25) / 2 - 0.1;
  pole.rotation.z = tilt;
  pole.position.x = -Math.sin(tilt) * (H / 2);
  head.position.x = -Math.sin(tilt) * H;
  head.position.y = Math.cos(tilt) * H;
  pole.castShadow = true;
  group.add(pole);
  group.userData.radius = 0.5;
  group.userData.material = 'wood';
  return group;
}
