// Pavilhão sobre palafitas (colunas laqueadas de vermelho, guarda-corpo baixo,
// telhado de quatro águas com beirais que se erguem nos cantos) e a passarela
// em zigue-zague (yatsuhashi) que leva até ele.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../core/noise.js';
import { lanternHalo } from './lantern.js';
import { getKit } from './kit.js';

const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x8a2a1c, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.35 });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.8 });

export const redLanternGlow = new THREE.MeshStandardMaterial({
  color: 0xd8442a, emissive: 0xff5a2a, emissiveIntensity: 1.6, roughness: 0.9,
});

// Telhas: canaletas verticais e fiadas horizontais, desenhadas em canvas.
function tileTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  for (let x = 0; x < 128; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, '#2a2e33'); g.addColorStop(0.5, '#6a7078'); g.addColorStop(1, '#2a2e33');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 16, 128);
  }
  ctx.fillStyle = 'rgba(15,17,20,0.6)';
  for (let y = 0; y < 128; y += 32) ctx.fillRect(0, y, 128, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Telhado de quatro águas: cada água vai da linha do beiral (que sobe nas
// pontas) até o topo, numa curva côncava — íngreme em cima, suave no beiral.
function roofGeometry(E, H, lift, segS = 40, segT = 14) {
  const parts = [];
  for (let side = 0; side < 4; side++) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segT; i++) {
      const t = i / segT;
      for (let j = 0; j <= segS; j++) {
        const sN = j / segS * 2 - 1;
        const f = 1 - t;
        const x = sN * E * f, z = E * f;
        const y = H * Math.pow(t, 1.6) + lift * Math.pow(Math.abs(sN), 3) * f * f;
        pos.push(x, y, z);
        uv.push(sN * E * 0.9, t * 3);
      }
    }
    for (let i = 0; i < segT; i++) {
      for (let j = 0; j < segS; j++) {
        const a = i * (segS + 1) + j, b = a + 1, c = a + segS + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.rotateY((side * Math.PI) / 2);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

function hangingLantern() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12).scale(1, 1.25, 1), redLanternGlow);
  g.add(body);
  for (const y of [0.24, -0.24]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 14), darkWood);
    cap.position.y = y;
    g.add(cap);
  }
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 4), darkWood);
  cord.position.y = 0.5;
  g.add(cord);
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 8), redLanternGlow);
  tassel.position.y = -0.38;
  tassel.rotation.x = Math.PI;
  g.add(tassel);
  const halo = new THREE.Sprite(lanternHalo);
  halo.scale.setScalar(1.4);
  halo.raycast = () => {};
  g.add(halo);
  return g;
}

export function createPavilion({ half = 2.3, floorY = 0.5, waterY = 0 } = {}) {
  const kit = getKit();
  const group = new THREE.Group();
  // assoalho e palafitas
  const floor = new THREE.BoxGeometry(half * 2, 0.16, half * 2);
  const uv = floor.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * half * 0.9, uv.getY(i));
  const floorMesh = new THREE.Mesh(floor, kit.woodMat);
  floorMesh.position.y = floorY - 0.08;
  floorMesh.castShadow = floorMesh.receiveShadow = true;
  group.add(floorMesh);
  const stilts = [];
  for (const x of [-half + 0.2, 0, half - 0.2]) {
    for (const z of [-half + 0.2, 0, half - 0.2]) {
      stilts.push(new THREE.CylinderGeometry(0.09, 0.1, floorY - waterY + 1.2, 8).translate(x, (floorY + waterY - 1.2) / 2 - 0.08, z));
    }
  }
  const stiltMesh = new THREE.Mesh(mergeGeometries(stilts), darkWood);
  stiltMesh.castShadow = true;
  group.add(stiltMesh);

  // colunas, vigas e guarda-corpo
  const colH = 2.5;
  const cols = [], beams = [], rails = [];
  const ph = half - 0.15;
  for (const x of [-ph, ph]) for (const z of [-ph, ph]) cols.push(new THREE.CylinderGeometry(0.1, 0.11, colH, 12).translate(x, floorY + colH / 2, z));
  for (const s of [-ph, ph]) {
    beams.push(new THREE.BoxGeometry(ph * 2 + 0.3, 0.18, 0.16).translate(0, floorY + colH - 0.05, s));
    beams.push(new THREE.BoxGeometry(0.16, 0.18, ph * 2 + 0.3).translate(s, floorY + colH - 0.05, 0));
  }
  // guarda-corpo em três lados (a frente, voltada para a passarela, é aberta)
  const railY = floorY + 0.5;
  const sides = [[[-ph, -ph], [ph, -ph]], [[-ph, -ph], [-ph, ph]], [[ph, -ph], [ph, ph]]];
  for (const [[ax, az], [bx, bz]] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    const along = new THREE.Vector3(bx - ax, 0, bz - az).normalize();
    const rail = new THREE.BoxGeometry(len, 0.06, 0.08);
    if (Math.abs(along.z) > 0.5) rail.rotateY(Math.PI / 2);
    rails.push(rail.clone().translate((ax + bx) / 2, railY, (az + bz) / 2));
    rails.push(rail.clone().translate((ax + bx) / 2, floorY + 0.15, (az + bz) / 2));
    for (let k = 1; k < 10; k++) {
      const f = k / 10;
      rails.push(new THREE.BoxGeometry(0.035, 0.35, 0.035).translate(ax + (bx - ax) * f, floorY + 0.32, az + (bz - az) * f));
    }
  }
  const lac = new THREE.Mesh(mergeGeometries([...cols, ...beams, ...rails].map((g) => (g.index ? g.toNonIndexed() : g))), lacquer);
  lac.castShadow = lac.receiveShadow = true;
  group.add(lac);

  // telhado (telhas em cima, madeira escura por baixo)
  const roofY = floorY + colH + 0.05;
  const E = half + 1.1, H = 1.55;
  const tiles = tileTexture();
  const roofG = roofGeometry(E, H, 0.55);
  const roof = new THREE.Mesh(roofG, new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.6, metalness: 0.1, side: THREE.FrontSide }));
  roof.position.y = roofY;
  roof.castShadow = roof.receiveShadow = true;
  group.add(roof);
  const under = new THREE.Mesh(roofG, new THREE.MeshStandardMaterial({ color: 0x4a3122, roughness: 0.85, side: THREE.BackSide }));
  under.position.y = roofY - 0.08;
  group.add(under);
  // cumeeiras nas quatro quinas, que terminam curvadas para cima
  const ridges = [];
  for (let side = 0; side < 4; side++) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, f = 1 - t;
      pts.push(new THREE.Vector3(E * f, roofY + H * Math.pow(t, 1.6) + 0.55 * f * f + 0.06, E * f).applyAxisAngle(new THREE.Vector3(0, 1, 0), (side * Math.PI) / 2));
    }
    const tip = pts[0].clone();
    pts.unshift(tip.clone().multiplyScalar(1.04).setY(tip.y + 0.22));
    ridges.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.06, 6));
  }
  const finial = new THREE.LatheGeometry([[0, 0], [0.12, 0], [0.14, 0.08], [0.06, 0.18], [0.1, 0.28], [0.03, 0.45], [0, 0.5]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
  finial.translate(0, roofY + H, 0);
  const ridgeMesh = new THREE.Mesh(mergeGeometries([...ridges, finial].map((g) => (g.index ? g.toNonIndexed() : g))), new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.5, metalness: 0.2 }));
  ridgeMesh.castShadow = true;
  group.add(ridgeMesh);

  // lanternas penduradas nos cantos da frente
  const lights = [];
  for (const x of [-ph - 0.4, ph + 0.4]) {
    const l = hangingLantern();
    l.position.set(x, roofY - 0.35 + 0.55 * 0.6, ph + 0.4);
    group.add(l);
    lights.push({ object: l, color: 0xff6a3a, intensity: 3, distance: 7, flicker: true, day: 0 });
  }

  // uma mesinha baixa com bule, para dar vida ao pavilhão
  const table = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.6), kit.woodMat);
  table.position.set(0, floorY + 0.3, -0.4);
  const legs = [];
  for (const x of [-0.38, 0.38]) for (const z of [-0.24, 0.24]) legs.push(new THREE.BoxGeometry(0.05, 0.28, 0.05).translate(x, floorY + 0.14, z - 0.4));
  const legMesh = new THREE.Mesh(mergeGeometries(legs), darkWood);
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 10).scale(1, 0.8, 1), new THREE.MeshPhysicalMaterial({ color: 0x3a5a4a, roughness: 0.25, clearcoat: 1 }));
  pot.position.set(-0.15, floorY + 0.39, -0.4);
  for (const m of [table, legMesh, pot]) { m.castShadow = m.receiveShadow = true; group.add(m); }
  return { group, lights, floorY, half };
}

// ---------------------------------------------------------------------------
// Passarela em zigue-zague. points: [[x, z], ...] em sequência.
export function createBoardwalk(points, { width = 1.1, height = 0.38, waterY = 0, seed = 7 } = {}) {
  const kit = getKit();
  const R = rng(seed);
  const planks = [], frame = [];
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bx - ax, bz - az);
    segments.push({ ax, az, bx, bz, len, ang });
    const m = new THREE.Matrix4().makeRotationY(ang).setPosition(ax, 0, az);
    // tábuas atravessadas, com frestas e leve variação de altura e tom
    for (let d = 0.1; d < len + 0.3; d += 0.17) {
      const g = new THREE.BoxGeometry(width + (R() - 0.5) * 0.04, 0.045, 0.15);
      const uv = g.attributes.uv;
      const row = Math.floor(R() * 4) / 4, off = R();
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.5 + off, row + 0.02 + uv.getY(k) * 0.2);
      g.translate(0, height - 0.022 + (R() - 0.5) * 0.006, d - 0.15);
      g.applyMatrix4(m);
      planks.push(g);
    }
    // longarinas e estacas
    for (const sx of [-width / 2 + 0.08, width / 2 - 0.08]) {
      frame.push(new THREE.BoxGeometry(0.09, 0.12, len + 0.4).translate(sx, height - 0.1, len / 2).applyMatrix4(m));
    }
    for (let d = 0; d <= len; d += Math.max(len / Math.ceil(len / 1.7), 0.5)) {
      for (const sx of [-width / 2 + 0.08, width / 2 - 0.08]) {
        frame.push(new THREE.CylinderGeometry(0.06, 0.07, height - waterY + 1, 7).translate(sx, (height + waterY - 1) / 2 - 0.1, d).applyMatrix4(m));
      }
    }
  }
  const p = new THREE.Mesh(mergeGeometries(planks), kit.woodMat);
  p.castShadow = p.receiveShadow = true;
  const f = new THREE.Mesh(mergeGeometries(frame.map((g) => (g.index ? g.toNonIndexed() : g))), darkWood);
  f.castShadow = true;
  const group = new THREE.Group();
  group.add(p, f);

  // o ponto (x, z) está sobre a passarela?
  function contains(x, z, margin = 0) {
    for (const s of segments) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const t = ((x - s.ax) * dx + (z - s.az) * dz) / (s.len * s.len);
      if (t < -0.08 || t > 1.08) continue;
      const px = s.ax + dx * t, pz = s.az + dz * t;
      if (Math.hypot(x - px, z - pz) < width / 2 + margin) return true;
    }
    return false;
  }
  return { group, contains, height, segments };
}
