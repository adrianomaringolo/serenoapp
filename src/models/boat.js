// Barquinho de madeira (casco de pontas finas, bancos e remos) e lanternas de
// papel flutuantes, que o jogador solta no lago e que derivam devagar.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../core/noise.js';
import { createFlame } from './candle.js';
import { lanternHalo } from './lantern.js';
import { getKit } from './kit.js';

// Casco aberto: u ao longo do comprimento, v de um bordo ao outro.
function hullGeometry(L = 2.5, W = 0.55, D = 0.32) {
  const segU = 28, segV = 14;
  const pos = [], uv = [], idx = [];
  const width = (u) => W * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.55);
  const depth = (u) => D * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.3);
  const sheer = (u) => 0.16 * Math.pow(2 * u - 1, 2); // as pontas sobem
  for (let i = 0; i <= segU; i++) {
    const u = i / segU;
    for (let j = 0; j <= segV; j++) {
      const v = (j / segV) * 2 - 1;
      const x = (u - 0.5) * L;
      const z = v * width(u);
      const y = sheer(u) - depth(u) * Math.pow(Math.max(0, 1 - v * v), 0.55);
      pos.push(x, y, z);
      uv.push(u * L / 1.5, 0.25 + (j / segV) * 0.22);
    }
  }
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const a = i * (segV + 1) + j, b = a + 1, c = a + segV + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { g, width, sheer, depth, L };
}

export function createBoat(seed = 1) {
  const kit = getKit();
  const R = rng(seed * 3 + 7);
  const group = new THREE.Group();
  const hull = hullGeometry(2.5 + R() * 0.3);
  const hullMat = kit.woodMat.clone();
  hullMat.side = THREE.DoubleSide;
  hullMat.color = new THREE.Color(0.85 + R() * 0.1, 0.8, 0.75);
  const m = new THREE.Mesh(hull.g, hullMat);
  m.castShadow = m.receiveShadow = true;
  group.add(m);

  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 });
  const parts = [];
  // amurada: um tubo em cada bordo
  for (const sv of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      pts.push(new THREE.Vector3((u - 0.5) * hull.L, hull.sheer(u) + 0.01, sv * hull.width(u)));
    }
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.028, 6));
  }
  // bancos
  for (const u of [0.34, 0.62]) {
    const w = hull.width(u) * 2 - 0.06;
    parts.push(new THREE.BoxGeometry(0.2, 0.04, w).translate((u - 0.5) * hull.L, hull.sheer(u) - 0.1, 0));
  }
  // remos deitados dentro do barco
  for (const sz of [-0.13, 0.13]) {
    parts.push(new THREE.CylinderGeometry(0.018, 0.018, 1.7, 6).rotateZ(Math.PI / 2 - 0.04).translate(0.05, -0.08, sz));
    parts.push(new THREE.BoxGeometry(0.4, 0.015, 0.11).translate(0.95, -0.11, sz));
  }
  const rim = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), dark);
  rim.castShadow = true;
  group.add(rim);

  // assoalho: tábuas acima da linha d'água. Sem ele, o espelho do lago
  // aparecia dentro do casco e o barco parecia não ter fundo.
  const lift = 0.2; // o casco sobe isto para a linha d'água
  const floorY = 0.05 - lift; // em coordenadas do casco (fica a 5 cm acima da água)
  const outline = [];
  for (let i = 0; i <= 40; i++) {
    const u = 0.04 + (i / 40) * 0.92;
    // meia-largura onde o casco cruza a altura do assoalho
    const k = (hull.sheer(u) - floorY) / hull.depth(u);
    if (k >= 1) continue;
    const v = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(k, 0), 1 / 0.55)));
    outline.push([(u - 0.5) * hull.L, v * hull.width(u) - 0.01]);
  }
  const shape = new THREE.Shape();
  outline.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
  for (let i = outline.length - 1; i >= 0; i--) shape.lineTo(outline[i][0], -outline[i][1]);
  const floorG = new THREE.ShapeGeometry(shape, 2);
  floorG.rotateX(Math.PI / 2);
  const fuv = floorG.attributes.uv, fpos = floorG.attributes.position;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fpos.getX(i) / 1.5, 0.5 + fpos.getZ(i) * 0.4); // tábuas no comprido
  floorG.computeVertexNormals();
  const floorMat = kit.woodMat.clone();
  floorMat.side = THREE.DoubleSide;
  floorMat.color = new THREE.Color(0.78, 0.7, 0.62);
  const floor = new THREE.Mesh(floorG, floorMat);
  floor.position.y = floorY;
  floor.receiveShadow = true;
  group.add(floor);

  group.children.forEach((c) => (c.position.y += lift)); // linha d'água no casco
  group.userData.radius = hull.L * 0.55;
  group.userData.material = 'wood';
  group.userData.float = true;
  return group;
}

// Papel das lanternas: um só material, aceso conforme o momento do dia.
export const paperGlow = new THREE.MeshStandardMaterial({
  color: 0xfff0d8, roughness: 0.9, emissive: 0xffa04a, emissiveIntensity: 1.6, side: THREE.DoubleSide,
});

export function createFloatingLantern(seed = 1) {
  const kit = getKit();
  if (!paperGlow.map) { paperGlow.map = kit.washi; paperGlow.emissiveMap = kit.washi; paperGlow.needsUpdate = true; }
  const R = rng(seed * 5 + 3);
  const group = new THREE.Group();
  const s = 0.26 + R() * 0.06, h = 0.26 + R() * 0.08;

  const raft = new THREE.Mesh(new THREE.BoxGeometry(s + 0.1, 0.05, s + 0.1), kit.woodMat);
  raft.position.y = 0.01;
  raft.castShadow = true;
  group.add(raft);

  // quatro faces de papel (caixa sem tampa) e a moldura escura
  const walls = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.PlaneGeometry(s, h);
    g.translate(0, h / 2 + 0.04, s / 2);
    g.rotateY((k * Math.PI) / 2);
    walls.push(g);
  }
  const paper = new THREE.Mesh(mergeGeometries(walls), paperGlow);
  group.add(paper);
  const frame = [];
  for (const x of [-s / 2, s / 2]) for (const z of [-s / 2, s / 2]) frame.push(new THREE.BoxGeometry(0.018, h + 0.02, 0.018).translate(x, h / 2 + 0.04, z));
  for (const y of [0.045, h + 0.04]) {
    for (const r of [0, Math.PI / 2]) {
      for (const sz of [-s / 2, s / 2]) frame.push(new THREE.BoxGeometry(s + 0.02, 0.016, 0.016).translate(0, y, sz).applyMatrix4(new THREE.Matrix4().makeRotationY(r)));
    }
  }
  const fm = new THREE.Mesh(mergeGeometries(frame), new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.8 }));
  fm.castShadow = true;
  group.add(fm);

  const flame = createFlame();
  flame.position.y = 0.06;
  flame.scale.setScalar(1.3);
  group.add(flame);
  const halo = new THREE.Sprite(lanternHalo);
  halo.position.y = h / 2 + 0.05;
  halo.scale.setScalar(1.3);
  halo.raycast = () => {};
  group.add(halo);

  group.userData.radius = 0.32;
  group.userData.material = 'water';
  group.userData.float = true;
  group.userData.drift = true;
  group.userData.lights = [{ offset: new THREE.Vector3(0, h / 2 + 0.05, 0), color: 0xffa24f, intensity: 2.2, distance: 6, flicker: true, day: 0.2 }];
  return group;
}
