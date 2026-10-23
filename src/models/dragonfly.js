// Libélulas: corpo metálico, olhos grandes e quatro asas translúcidas com
// nervuras. Voam em arrancadas curtas entre as flores, param no ar e de vez
// em quando pousam num botão ou flor (os "poleiros"), de asas abertas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getKit } from './kit.js';

const COLORS = [0x2a7fa8, 0x3c9a5a, 0xb8442a, 0x2c5fb0, 0x7a9a3a];

// Cada libélula é só um "esqueleto" de Object3D (corpo + 4 pivôs de asa) para
// a conta do voo; o desenho de todas sai de duas InstancedMesh — corpos e
// asas —, 2 chamadas em vez de 8 por libélula (e o lago desenha tudo de novo
// no reflexo).
let shared = null;
function sharedParts() {
  if (shared) return shared;
  const kit = getKit();
  const parts = [];
  const paint = (g, hex) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
    return g.toNonIndexed();
  };
  // abdome comprido apontando para -z (a frente é +z), tórax e os olhos grandes
  parts.push(paint(new THREE.CylinderGeometry(0.006, 0.009, 0.1, 6, 4).rotateX(Math.PI / 2).translate(0, 0, -0.06), 0xffffff));
  parts.push(paint(new THREE.SphereGeometry(0.014, 10, 8).scale(1, 0.95, 1.3), 0xffffff));
  for (const sx of [-1, 1]) parts.push(paint(new THREE.SphereGeometry(0.011, 10, 8).translate(sx * 0.008, 0.003, 0.022), 0x2a3420));
  for (const g of parts) g.deleteAttribute('uv');
  shared = {
    body: mergeGeometries(parts),
    bodyMat: new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.25, iridescence: 0.8, iridescenceIOR: 1.4 }),
    wing: new THREE.PlaneGeometry(0.075, 0.019).translate(0.0375, 0, 0).rotateX(-Math.PI / 2),
    wingMat: new THREE.MeshPhysicalMaterial({
      map: kit.dragonflyWing, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      roughness: 0.15, metalness: 0, iridescence: 1, iridescenceIOR: 1.3,
    }),
  };
  return shared;
}

function dragonflyRig() {
  const g = new THREE.Object3D();
  const wings = [];
  for (const [sx, z] of [[1, 0.006], [-1, 0.006], [1, -0.012], [-1, -0.012]]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(sx * 0.008, 0.008, z);
    const w = new THREE.Object3D();
    if (sx < 0) w.rotation.y = Math.PI;
    pivot.add(w);
    pivot.userData.side = sx;
    pivot.userData.wing = w;
    g.add(pivot);
    wings.push(pivot);
  }
  g.scale.setScalar(2); // um pouco maiores que na vida: senão somem à distância
  g.userData.wings = wings;
  return g;
}

export function createDragonflies({ count = 7, perches = [], area, level = 0 }) {
  const group = new THREE.Group();
  const flies = [];
  const rand = (a, b) => a + Math.random() * (b - a);
  const randomPoint = () => new THREE.Vector3(rand(area[0], area[1]), level + rand(0.4, 1.8), rand(area[2], area[3]));
  const P = sharedParts();
  const bodies = new THREE.InstancedMesh(P.body, P.bodyMat, count);
  const wingsMesh = new THREE.InstancedMesh(P.wing, P.wingMat, count * 4);
  bodies.frustumCulled = wingsMesh.frustumCulled = false;
  group.add(bodies, wingsMesh);
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const m = dragonflyRig();
    m.position.copy(randomPoint());
    bodies.setColorAt(i, col.setHex(COLORS[i % COLORS.length]));
    flies.push({ m, vel: new THREE.Vector3(), target: randomPoint(), state: 'fly', timer: rand(1, 4), phase: Math.random() * 10 });
  }
  const tmp = new THREE.Vector3();

  function update(dt, t) {
    flies.forEach((f, fi) => {
      f.timer -= dt;
      if (f.state === 'fly') {
        tmp.subVectors(f.target, f.m.position);
        const d = tmp.length();
        // arrancada: acelera forte rumo ao alvo e freia perto dele
        f.vel.addScaledVector(tmp.normalize(), dt * 9 * Math.min(d, 1.5));
        f.vel.multiplyScalar(Math.pow(0.08, dt));
        if (d < 0.15 || f.timer <= 0) {
          f.state = Math.random() < 0.3 && perches.length ? 'land' : 'hover';
          f.timer = f.state === 'hover' ? rand(0.6, 2.5) : 0;
          if (f.state === 'land') f.target = perches[Math.floor(Math.random() * perches.length)].clone();
        }
      } else if (f.state === 'hover') {
        f.vel.multiplyScalar(Math.pow(0.02, dt));
        f.m.position.y += Math.sin(t * 7 + f.phase) * dt * 0.05;
        if (f.timer <= 0) { f.state = 'fly'; f.target = randomPoint(); f.timer = rand(2, 5); }
      } else if (f.state === 'land') {
        tmp.subVectors(f.target, f.m.position);
        const d = tmp.length();
        f.vel.copy(tmp).multiplyScalar(Math.min(1, dt * 3) / Math.max(dt, 1e-3) * 0.5);
        if (d < 0.02) { f.state = 'perch'; f.timer = rand(3, 9); f.vel.set(0, 0, 0); }
      } else if (f.state === 'perch' && f.timer <= 0) {
        f.state = 'fly'; f.target = randomPoint(); f.timer = rand(2, 5);
      }
      f.m.position.addScaledVector(f.vel, dt);

      // vira o corpo para onde voa (no plano), sem rolar
      const sp = Math.hypot(f.vel.x, f.vel.z);
      if (sp > 0.05) {
        const yaw = Math.atan2(f.vel.x, f.vel.z);
        let dy = yaw - f.m.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        f.m.rotation.y += dy * Math.min(1, dt * 10);
      }
      f.m.rotation.x = -THREE.MathUtils.clamp(f.vel.y * 0.3, -0.4, 0.4);

      // asas: batem rápido no voo, param abertas no pouso
      const flying = f.state !== 'perch';
      f.m.userData.wings.forEach((w, k) => {
        const flap = flying ? Math.sin(t * 70 + (k < 2 ? 0 : 1.6) + f.phase) * 0.55 : 0.05;
        w.rotation.z = flap * w.userData.side;
      });
      // o esqueleto não está na cena: atualiza as matrizes e copia para as instâncias
      f.m.updateMatrixWorld(true);
      bodies.setMatrixAt(fi, f.m.matrixWorld);
      f.m.userData.wings.forEach((w, k) => wingsMesh.setMatrixAt(fi * 4 + k, w.userData.wing.matrixWorld));
    });
    bodies.instanceMatrix.needsUpdate = wingsMesh.instanceMatrix.needsUpdate = true;
  }
  return { group, update };
}
