// Lago: superfície com reflexo do céu e ondulação animada, carpas (koi)
// nadando por baixo, ondas ao tocar a água, vitórias-régias e lótus.
import * as THREE from 'three';
import { createNoise, rng, smoothstep } from '../core/noise.js';
import { paintGeometry, bakeGroup } from '../core/materials.js';
import { getKit } from './kit.js';

// ---------------------------------------------------------------------------
// Carpa
// ---------------------------------------------------------------------------
const KOI_PATTERNS = [
  { base: 0xf4f0e8, spot: 0xe0451c, spot2: null },     // kohaku
  { base: 0xf08a1e, spot: 0xf7d36a, spot2: null },     // ogon laranja
  { base: 0xf4f0e8, spot: 0xd8401a, spot2: 0x1b1b1f }, // sanke
  { base: 0xe9c75a, spot: 0xf4ecd6, spot2: null },     // yamabuki
  { base: 0x23232a, spot: 0xe5591f, spot2: 0xf2efe6 }, // showa
];

function koiMesh(seed) {
  const nz = createNoise(seed);
  const pat = KOI_PATTERNS[seed % KOI_PATTERNS.length];
  const prof = [[0, 0], [0.035, 0.02], [0.06, 0.07], [0.068, 0.14], [0.06, 0.22], [0.042, 0.3], [0.022, 0.36], [0.012, 0.4], [0, 0.41]];
  const body = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 14);
  body.rotateX(Math.PI / 2); // cabeça em z=0, cauda em z=+0.41
  body.scale(0.8, 1, 1);
  const A = new THREE.Color(pat.base), S = new THREE.Color(pat.spot), S2 = pat.spot2 != null ? new THREE.Color(pat.spot2) : null;
  paintGeometry(body, 0xffffff, (c, x, y, z) => {
    c.copy(A);
    const n = nz.fbm3(x * 14, y * 14, z * 14, 3);
    if (n > 0.05 && y > -0.02) c.copy(S);
    if (S2 && nz.fbm3(x * 18 + 9, y * 18, z * 18, 2) > 0.18) c.copy(S2);
    if (y < -0.03) c.multiplyScalar(0.85);
    return c;
  });
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 });
  const mesh = new THREE.Mesh(body, mat);

  const finMat = new THREE.MeshStandardMaterial({
    color: pat.spot2 === 0x1b1b1f ? 0xf5ece0 : pat.base, transparent: true, opacity: 0.7, side: THREE.DoubleSide, roughness: 0.4,
  });
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.quadraticCurveTo(0.08, 0.06, 0.13, 0.09);
  tailShape.quadraticCurveTo(0.09, 0, 0.13, -0.09);
  tailShape.quadraticCurveTo(0.08, -0.06, 0, 0);
  const tailGeo = new THREE.ShapeGeometry(tailShape, 6);
  tailGeo.rotateY(-Math.PI / 2); // aponta para +z
  tailGeo.rotateZ(Math.PI / 2);
  const tail = new THREE.Mesh(tailGeo, finMat);
  const tailPivot = new THREE.Group();
  tailPivot.position.z = 0.38;
  tailPivot.add(tail);
  const fins = [];
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8, 0, Math.PI), finMat);
    f.rotation.set(-Math.PI / 2, 0, sx > 0 ? -0.6 : Math.PI + 0.6);
    f.position.set(sx * 0.045, -0.02, 0.1);
    fins.push(f);
    mesh.add(f);
  }
  const dorsal = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8, 0, Math.PI), finMat);
  dorsal.rotation.set(0, Math.PI / 2, 0);
  dorsal.position.set(0, 0.045, 0.2);
  dorsal.scale.set(1.4, 0.6, 1);
  mesh.add(dorsal);

  const g = new THREE.Group();
  g.add(mesh, tailPivot);
  g.userData = { tailPivot, fins };
  return g;
}

// ---------------------------------------------------------------------------
// Vitória-régia e lótus
// ---------------------------------------------------------------------------
export function lilyPadGeometry(seed, r = 0.3) {
  const R = rng(seed);
  const g = new THREE.CircleGeometry(r, 28, 0.15, Math.PI * 2 - 0.3);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = Math.hypot(x, z) / r;
    pos.setY(i, d * d * 0.015 + Math.sin(Math.atan2(z, x) * 5 + seed) * 0.004 * d);
  }
  g.computeVertexNormals();
  const a = new THREE.Color(0x2f5a22), b = new THREE.Color(0x5f8a32), rim = new THREE.Color(0x7a5a2a);
  paintGeometry(g, 0xffffff, (c, x, y, z) => {
    const d = Math.hypot(x, z) / r;
    const ang = Math.atan2(z, x);
    const vein = Math.pow(Math.abs(Math.sin(ang * 9)), 18) * (1 - d) * 0.3;
    c.copy(a).lerp(b, 0.4 + 0.4 * R() * 0.3 + vein);
    if (d > 0.92) c.lerp(rim, 0.4);
    return c;
  });
  return g;
}

function petalGeometry(len, wid, cup) {
  const g = new THREE.PlaneGeometry(wid, len, 4, 6);
  g.translate(0, len / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const t = y / len;
    const w = Math.sin(Math.min(t, 0.999) * Math.PI) * (1 - t * 0.35);
    const nx = x * (0.35 + w * 1.1);
    pos.setXYZ(i, nx, y, -Math.pow(nx / wid, 2) * cup * 2 + t * t * cup * 0.4);
  }
  g.computeVertexNormals();
  return g;
}

const lotusMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, emissive: 0xff7aa0, emissiveIntensity: 0.04 });

export function createLotus(seed = 1) {
  const kit = getKit();
  const R = rng(seed * 11 + 2);
  const group = new THREE.Group();
  const pad = new THREE.Mesh(lilyPadGeometry(seed, 0.42 + R() * 0.12), kit.painted);
  pad.receiveShadow = true;
  pad.rotation.y = R() * Math.PI * 2;
  group.add(pad);

  const flower = new THREE.Group();
  const tipPink = new THREE.Color(R() > 0.3 ? 0xf27da0 : 0xf3e9ef), basePink = new THREE.Color(0xfff4f2);
  const rings = [[8, 0.2, 0.1, 1.15], [8, 0.17, 0.09, 0.75], [6, 0.13, 0.075, 0.38]];
  rings.forEach(([n, len, wid, open], ri) => {
    const g = petalGeometry(len, wid, 0.05);
    paintGeometry(g, 0xffffff, (c, x, y) => c.copy(basePink).lerp(tipPink, smoothstep(0.1, len, y) * (0.6 + ri * 0.2)));
    for (let k = 0; k < n; k++) {
      const p = new THREE.Mesh(g, lotusMat);
      const a = (k / n) * Math.PI * 2 + ri * 0.4;
      p.rotation.order = 'YXZ';
      p.rotation.y = a;
      p.rotation.x = open;
      p.position.set(Math.sin(a) * 0.02, 0.02, Math.cos(a) * 0.02);
      p.castShadow = true;
      flower.add(p);
    }
  });
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.05, 14), new THREE.MeshStandardMaterial({ color: 0xe7c43a, roughness: 0.6, emissive: 0x6a4a00, emissiveIntensity: 0.2 }));
  pod.position.y = 0.05;
  flower.add(pod);
  bakeGroup(flower);
  flower.position.set(0.04, 0.02, 0.02);
  group.add(flower);
  group.userData.radius = 0.5;
  group.userData.material = 'water';
  group.userData.float = true;
  return group;
}

// ---------------------------------------------------------------------------
// Lago
// ---------------------------------------------------------------------------
export function createPond({ center, radiusAt, level = -0.18, koiCount = 6 }) {
  const kit = getKit();
  const group = new THREE.Group();

  // superfície: contorno do lago um pouco além da margem (o terreno esconde o resto).
  // Ângulo `a` medido no mundo como atan2(dz, dx); o shape é girado para o chão.
  const shape = new THREE.Shape();
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = radiusAt(a) + 0.35;
    const x = Math.cos(a) * r, y = -Math.sin(a) * r;
    i ? shape.lineTo(x, y) : shape.moveTo(x, y);
  }
  const geo = new THREE.ShapeGeometry(shape, 24);
  geo.rotateX(-Math.PI / 2);
  // UV em metros, para o normal map repetir em escala fixa
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);

  const normal = kit.waterNormal.clone();
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.needsUpdate = true;
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x0c2626, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.62,
    normalMap: normal, normalScale: new THREE.Vector2(0.22, 0.22), envMapIntensity: 0.85,
    clearcoat: 1, clearcoatRoughness: 0.08, ior: 1.33,
  });
  // segundo conjunto de ondas, deslizando em outra direção
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWaterT = waterTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWaterT;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 n2 = texture2D(normalMap, vNormalMapUv * 0.6 + vec2(-uWaterT * 0.013, uWaterT * 0.009)).xyz * 2.0 - 1.0;
          n2.xy *= normalScale * 0.8;
          normal = normalize(normal + tbn * n2 * 0.5);
        }`,
      );
  };
  const water = new THREE.Mesh(geo, mat);
  water.position.set(center.x, level, center.z);
  water.receiveShadow = true;
  water.renderOrder = 2;
  group.add(water);

  // vitórias-régias espalhadas
  const R = rng(81);
  const pads = [];
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2;
    const r = (0.35 + R() * 0.5) * radiusAt(a);
    const pad = new THREE.Mesh(lilyPadGeometry(100 + i, 0.22 + R() * 0.2), kit.painted);
    pad.position.set(center.x + Math.cos(a) * r, level + 0.01, center.z + Math.sin(a) * r);
    pad.rotation.y = R() * Math.PI * 2;
    pad.receiveShadow = true;
    pads.push({ mesh: pad, phase: R() * 10 });
    group.add(pad);
  }

  // carpas
  const fish = [];
  for (let i = 0; i < koiCount; i++) {
    const k = koiMesh(i + 1);
    const sc = 0.9 + R() * 0.6;
    k.scale.setScalar(sc);
    const a = R() * Math.PI * 2;
    const r = R() * radiusAt(a) * 0.5;
    k.position.set(center.x + Math.cos(a) * r, level - 0.32 - R() * 0.15, center.z + Math.sin(a) * r);
    fish.push({ mesh: k, heading: R() * Math.PI * 2, speed: 0.25 + R() * 0.2, turn: 0, phase: R() * 10, depth: k.position.y });
    group.add(k);
  }

  // ondas (anéis que se abrem e somem)
  const ringGeo = new THREE.RingGeometry(0.92, 1, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const ripples = [];
  let food = null;

  function inside(x, z, margin = 0) {
    const dx = x - center.x, dz = z - center.z;
    const a = Math.atan2(dz, dx);
    return Math.hypot(dx, dz) < radiusAt(a) - margin;
  }

  function ripple(point, strength = 1) {
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: true }));
      m.position.set(point.x, level + 0.012, point.z);
      m.renderOrder = 3;
      group.add(m);
      ripples.push({ mesh: m, t: -k * 0.35, strength });
    }
    food = { x: point.x, z: point.z, t: 6 };
  }

  function update(dt, t) {
    waterTime.value = t;
    normal.offset.set(t * 0.011, t * 0.006);

    for (const p of pads) {
      p.mesh.position.y = level + 0.012 + Math.sin(t * 0.8 + p.phase) * 0.004;
      p.mesh.rotation.y += Math.sin(t * 0.1 + p.phase) * dt * 0.02;
    }

    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.t += dt;
      if (r.t < 0) continue;
      const s = 0.1 + r.t * 0.9;
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = Math.max(0, 0.35 * (1 - r.t / 2.6)) * r.strength;
      if (r.t > 2.6) {
        group.remove(r.mesh);
        r.mesh.material.dispose();
        ripples.splice(i, 1);
      }
    }
    if (food) {
      food.t -= dt;
      if (food.t <= 0) food = null;
    }

    for (const f of fish) {
      const m = f.mesh;
      // vontade de virar: passeio aleatório + fugir da margem + procurar comida
      f.turn += (Math.sin(t * 0.3 + f.phase) * 0.6 + (Math.random() - 0.5) * 0.8) * dt;
      f.turn *= 0.98;
      let desired = null;
      const fx = m.position.x, fz = m.position.z;
      if (!inside(fx + Math.sin(f.heading) * 0.9, fz + Math.cos(f.heading) * 0.9, 0.6)) {
        desired = Math.atan2(center.x - fx, center.z - fz);
      }
      let speed = f.speed;
      if (food) {
        const d = Math.hypot(food.x - fx, food.z - fz);
        if (d > 0.25) desired = Math.atan2(food.x - fx, food.z - fz);
        speed = f.speed * (d > 0.6 ? 2.2 : 0.6);
      }
      if (desired != null) {
        let diff = desired - f.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        f.heading += diff * Math.min(1, dt * 1.6);
      }
      f.heading += f.turn * dt;
      // a carpa nada com a cabeça em -z local: virar o corpo para o rumo
      m.position.x += Math.sin(f.heading) * speed * dt;
      m.position.z += Math.cos(f.heading) * speed * dt;
      m.rotation.y = f.heading + Math.PI;
      const swim = t * (4 + speed * 8) + f.phase;
      m.userData.tailPivot.rotation.y = Math.sin(swim) * 0.5;
      m.rotation.z = Math.sin(swim) * 0.04;
      const targetDepth = food ? level - 0.18 : f.depth;
      m.position.y += (targetDepth - m.position.y) * Math.min(1, dt * 0.8);

    }
  }

  return { group, water, update, ripple, inside, level };
}

const waterTime = { value: 0 };
