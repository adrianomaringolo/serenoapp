// Pedras: icosaedro deformado por ruído, base achatada (assenta no chão),
// cor variando por veios e musgo crescendo onde a face olha para cima.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise, rng, smoothstep } from '../core/noise.js';
import { getKit } from './kit.js';

const PALETTES = [
  [0x86837d, 0x6c6a66], // granito
  [0x7b766d, 0x5f5a52], // quente
  [0x6f7275, 0x55585c], // azulado
  [0x8e8a80, 0x77715f], // claro
];

export function rockGeometry(seed, {
  detail = 4, sx = 1, sy = 0.7, sz = 0.85, rough = 0.38, flat = -0.3, moss = 0.6, palette,
} = {}) {
  const nz = createNoise(seed);
  const R = rng(seed);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const o = R() * 100;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // grandes planos + ruído médio + rugosidade fina
    let d = 1 + nz.fbm3(v.x * 1.1 + o, v.y * 1.1, v.z * 1.1, 3) * rough;
    d += Math.abs(nz.fbm3(v.x * 3 + o, v.y * 3, v.z * 3, 3)) * rough * 0.35;
    d += nz.n3(v.x * 9 + o, v.y * 9, v.z * 9) * rough * 0.08;
    v.multiplyScalar(d);
    v.x *= sx; v.y *= sy; v.z *= sz;
    const fy = flat * sy;
    if (v.y < fy) v.y = fy + (v.y - fy) * 0.12;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();

  const [c1, c2] = palette || PALETTES[Math.floor(R() * PALETTES.length)];
  const A = new THREE.Color(c1), B = new THREE.Color(c2);
  const mossC = new THREE.Color(0x4c6a2a), mossL = new THREE.Color(0x6f8a3a);
  const nrm = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = nz.fbm3(x * 2.5 + o, y * 2.5, z * 2.5, 3);
    c.copy(A).lerp(B, smoothstep(-0.3, 0.3, n));
    // faixas (estratos) leves
    const band = Math.sin(y * 14 + n * 4) * 0.04;
    c.multiplyScalar(0.95 + band);
    // musgo no alto
    const up = nrm.getY(i);
    const m = smoothstep(0.35, 0.8, up + nz.fbm3(x * 4 + 7, y * 4, z * 4, 3) * 0.6) * moss;
    if (m > 0) c.lerp(mossC.clone().lerp(mossL, smoothstep(-0.2, 0.4, n)), m);
    // sombra de contato na base
    c.multiplyScalar(0.55 + 0.45 * smoothstep(flat * sy, flat * sy + 0.35 * sy, y));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Ilha de musgo achatada sob a pedra (como nos jardins de areia de Kyoto).
export function mossIslandGeometry(seed, radius = 1.2) {
  const nz = createNoise(seed + 99);
  // disco em grade polar: domo baixo, borda que afunda na areia, almofadinhas
  const rings = 30, segs = 96;
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    for (let j = 0; j < segs; j++) {
      const ang = (j / segs) * Math.PI * 2;
      const edge = radius * (1 + 0.2 * Math.sin(ang * 3 + seed) + 0.1 * Math.sin(ang * 5 + seed * 2) + nz.n2(Math.cos(ang) * 1.5 + seed, Math.sin(ang) * 1.5) * 0.25);
      const r = edge * t;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r * 0.85;
      const dome = Math.pow(1 - t * t, 0.6);
      const cushion = Math.abs(nz.n2(x * 7, z * 7)) * 0.05 + nz.n2(x * 16 + 3, z * 16) * 0.01;
      const y = dome * (0.08 + cushion) - (t > 0.97 ? 0.02 : 0);
      pos.push(x, y, z);
      uvs.push(x * 0.45, z * 0.45);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * segs + j, b = i * segs + ((j + 1) % segs);
      const c2 = (i + 1) * segs + j, d = (i + 1) * segs + ((j + 1) % segs);
      idx.push(a, b, c2, b, d, c2);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g = mergeVertices(g); // une o centro do disco
  g.computeVertexNormals();
  const P = g.attributes.position;
  const col = new Float32Array(P.count * 3);
  // a cor vem da textura de musgo do chão; aqui só sombreamos
  const c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const v = 0.78 + 0.22 * smoothstep(-0.4, 0.5, nz.fbm2(x * 1.5, z * 1.5, 3));
    c.setRGB(v * 0.95, v, v * 0.9);
    c.multiplyScalar(0.55 + 0.45 * smoothstep(0.0, 0.06, y)); // borda mais escura
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function createRock(seed = 1, { size = 1, moss = 0.55, island = false, ...shape } = {}) {
  const kit = getKit();
  const R = rng(seed * 7 + 3);
  const opts = {
    sx: 0.9 + R() * 0.4, sy: 0.55 + R() * 0.45, sz: 0.75 + R() * 0.3,
    moss, ...shape,
  };
  const g = rockGeometry(seed, opts);
  const mesh = new THREE.Mesh(g, kit.stone);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.scale.setScalar(size);
  mesh.position.y = -(opts.flat ?? -0.3) * opts.sy * size * 0.8;
  mesh.rotation.y = R() * Math.PI * 2;

  const group = new THREE.Group();
  group.add(mesh);
  if (island) {
    const isl = new THREE.Mesh(mossIslandGeometry(seed, size * (1.35 + R() * 0.3)), kit.moss);
    isl.receiveShadow = true;
    isl.position.y = 0.02;
    group.add(isl);
  }
  group.userData.radius = size * 1.1 * (island ? 1.5 : 1);
  group.userData.material = 'stone';
  return group;
}

// Pedras empilhadas, cada uma achatada e um pouco menor que a de baixo.
export function createCairn(seed = 1) {
  const kit = getKit();
  const R = rng(seed * 13 + 5);
  const group = new THREE.Group();
  const n = 4 + Math.floor(R() * 3);
  let y = 0;
  let size = 0.36 + R() * 0.08;
  for (let i = 0; i < n; i++) {
    const sy = 0.38 + R() * 0.12;
    const g = rockGeometry(seed * 31 + i, {
      detail: 3, sx: 1, sy, sz: 0.85 + R() * 0.15, rough: 0.18, flat: -0.75, moss: i === 0 ? 0.3 : 0.05,
      palette: [[0x8a8780, 0x64625e], [0x7d7d79, 0x5b5a57]][i % 2],
    });
    g.computeBoundingBox();
    const bb = g.boundingBox;
    const m = new THREE.Mesh(g, kit.stone);
    m.castShadow = m.receiveShadow = true;
    m.scale.setScalar(size);
    m.position.set((R() - 0.5) * 0.04, y - bb.min.y * size, (R() - 0.5) * 0.04);
    m.rotation.set((R() - 0.5) * 0.08, R() * Math.PI * 2, (R() - 0.5) * 0.08);
    group.add(m);
    y += (bb.max.y - bb.min.y) * size * 0.92;
    size *= 0.78 + R() * 0.08;
  }
  group.userData.radius = 0.45;
  group.userData.material = 'stone';
  return group;
}
