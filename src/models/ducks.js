// Patos-mandarim (oshidori), o casal que é símbolo de afeto no Japão.
//
// Modelos: corpo em forma de barco assentado na linha d'água, pintado por
// regiões (no macho: peito vinho com as duas listras brancas, flancos dourados
// rajados, velas laranja nas costas, crista verde e roxa, a meia-lua branca
// atrás do olho e a "barba" laranja; na fêmea: cinza-amarronzada com pintas
// claras e o anel branco no olho). Cabeça e pescoço articulados.
//
// Comportamento de cada pato: nada balançando, olha em volta, mergulha a
// cabeça para comer (rabo para cima), alisa as penas, sacode a cabeça e bebe.
// O casal para de nadar quando um deles está ocupado. Quem desloca o grupo no
// lago é o ambiente (userData.swim / swimSpeed); as ondinhas são pedidas em
// userData.splash.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, smoothstep } from '../core/noise.js';
import { paintGeometry } from '../core/materials.js';

const C = (h) => new THREE.Color(h);
const FEATHERS = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, sheen: 0.25, sheenRoughness: 0.5, sheenColor: C(0xffffff), side: THREE.DoubleSide });
const SAIL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });

// Deforma uma esfera unitária com fn(v) → [x, y, z] e pinta com paint(v) → Color,
// onde v é a posição na esfera original (direção), fácil de pensar em regiões.
function sculpt(seg, fn, paint) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const c = paint(v);
    const [x, y, z] = fn(v);
    pos.setXYZ(i, x, y, z);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function bodyGeometry(male) {
  const shape = (v) => {
    let x = v.x * 0.09, y = v.y > 0 ? v.y * 0.075 : v.y * 0.045, z = v.z * 0.16;
    if (v.z < 0) x *= 1 - 0.45 * v.z * v.z; // afina para trás
    if (v.z > 0.2 && v.y > -0.3) y += Math.sin((v.z - 0.2) / 0.8 * Math.PI * 0.5) * 0.03 * (0.4 + v.y); // peito cheio e alto
    if (v.z < -0.5) { // rabo empinado e pontudo
      const k = -v.z - 0.5;
      y += k * 0.09 * (v.y > -0.3 ? 1 : 0.6);
      z -= k * k * 0.08;
      x *= 1 - k * 0.6;
    }
    return [x, y + 0.02, z];
  };
  const vermic = (v) => 0.9 + 0.1 * Math.sin(v.y * 90 + Math.sin(v.z * 40) * 2.5);
  const spot = (v) => Math.sin(v.x * 83 + v.z * 117) * Math.sin(v.y * 131 + v.z * 47) > 0.62;
  const paintMale = (v) => {
    if (v.y < -0.35) return C(0xefebe2);
    if (v.z < -0.86) return C(0x2a2724);
    if (v.y > 0.47) return v.z < -0.2 ? C(0x232a3d) : C(0x3d3528); // costas; terciárias azuladas atrás
    if (v.z > 0.7) return C(0x5b1f35).lerp(C(0x7a3a5a), smoothstep(0.2, 0.6, v.y) * 0.4); // peito
    // as duas listras brancas contornadas de preto, logo atrás do peito
    if (v.z > 0.56 && v.y > -0.32) {
      if (v.z > 0.68) return C(0x151214);
      if (v.z > 0.645) return C(0xf4f1ea);
      if (v.z > 0.625) return C(0x151214);
      if (v.z > 0.59) return C(0xf4f1ea);
      return C(0x151214);
    }
    if (v.y > 0.41) return C(0x151214); // filete preto acima dos flancos
    return C(0xd8994e).multiplyScalar(vermic(v)).lerp(C(0xe9b874), smoothstep(-0.3, 0.2, v.y) * 0.25);
  };
  const paintFemale = (v) => {
    if (v.y < -0.35) return C(0xeeeae2);
    if (v.z < -0.86) return C(0x4a4038);
    if (v.y > 0.42) return C(0x6d6152).multiplyScalar(0.95 + 0.05 * Math.sin(v.z * 70));
    const base = v.z > 0.5 ? C(0x84705a) : C(0x7a6552);
    return spot(v) ? C(0xd9c8ac) : base;
  };
  return sculpt(48, shape, male ? paintMale : paintFemale);
}

function headGeometry(male) {
  const shape = (v) => {
    let x = v.x * 0.04, y = v.y * 0.043, z = v.z * 0.05;
    if (v.z > 0.6) y -= (v.z - 0.6) * 0.012; // testa desce para o bico
    return [x, y, z];
  };
  const paintMale = (v) => {
    const w = v.z;
    // meia-lua: começa logo acima/atrás do olho e alarga até a nuca
    const lo = 0.12 - Math.max(0, -w) * 0.35, hi = 0.5 + Math.max(0, -w) * 0.35;
    if (Math.abs(v.x) > 0.2 && w < 0.38 && v.y > lo && v.y < hi) return C(0xf6f3ec);
    if (v.y > 0.5) return C(0x2c5a40).lerp(C(0x4a2850), smoothstep(0.4, -0.4, w)); // crista
    if (w > 0.78) return C(0xe8c8a0); // rosto claro junto ao bico
    if (v.y < -0.45) return C(0xc25a26);
    return C(0xd8742a); // bochechas laranja
  };
  const paintFemale = (v) => {
    const eye = Math.hypot(Math.abs(v.x) - 0.8, v.y - 0.27, v.z - 0.45);
    if (eye > 0.1 && eye < 0.17) return C(0xf2efe8); // anel branco
    if (Math.abs(v.x) > 0.5 && v.y > 0.2 && v.y < 0.27 && v.z < 0.32 && v.z > -0.5) return C(0xf2efe8); // risco para trás
    if (v.y < -0.5 && v.z > 0.2) return C(0xeeeae2); // queixo
    return v.y > 0.45 ? C(0x6f6a64) : C(0x8b8781);
  };
  return sculpt(36, shape, male ? paintMale : paintFemale);
}

// Crista do macho: juba que cai da nuca para trás.
function crestGeometry() {
  const g = sculpt(24, (v) => {
    let x = v.x * 0.03, y = v.y * 0.022, z = v.z * 0.048;
    if (v.z < 0) { z -= v.z * v.z * 0.02; x *= 1 + v.z * 0.4; }
    return [x, y, z];
  }, (v) => (v.y > -0.2 ? C(0x2c5a40).lerp(C(0x5a2a5a), smoothstep(0.5, -0.8, v.z)) : C(0xb8582a)));
  g.rotateX(-0.55); // a ponta de trás cai em direção à nuca
  g.translate(0, 0.012, -0.03);
  return g;
}

// "Barba" do macho: leque de penas finas e laranja nas bochechas.
function ruffGeometry() {
  const parts = [];
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 14; k++) {
      const a = Math.PI * (0.55 + (k / 13) * 0.6); // de baixo para trás
      const len = 0.038 + Math.sin((k / 13) * Math.PI) * 0.018;
      const g = new THREE.BufferGeometry();
      const dx = 0, dy = Math.sin(a + Math.PI / 2) * len, dz = Math.cos(a + Math.PI / 2) * len;
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.0025, 0, 0, -0.0025, dx + sx * 0.006, dy, dz], 3));
      const tip = C(0xf0a45a), base = C(0xd0682a);
      g.setAttribute('color', new THREE.Float32BufferAttribute([base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b], 3));
      g.translate(sx * 0.033, -0.012, 0.004);
      g.computeVertexNormals();
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

// Vela: a pena laranja que o macho ergue nas costas, com a borda escura atrás.
function sailGeometry(sx) {
  const s = new THREE.Shape();
  s.moveTo(-0.022, 0);
  s.lineTo(0.022, 0);
  s.quadraticCurveTo(0.034, 0.032, 0.002, 0.05);
  s.quadraticCurveTo(-0.022, 0.036, -0.022, 0);
  const g = new THREE.ShapeGeometry(s, 8);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const c = x < -0.014 ? C(0x2a2420) : C(0xe0782a).lerp(C(0xf0a050), smoothstep(0, 0.045, y));
    if (x > 0.017 && y < 0.02) c.set(0xf2ede4);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.rotateY(Math.PI / 2); // plano de pé, ao longo do corpo
  g.rotateZ(sx * 0.28);
  g.translate(sx * 0.038, 0.074, -0.045);
  g.computeVertexNormals();
  return g;
}

function duck(male, seed) {
  const R = rng(seed);
  const root = new THREE.Group(); // gira inteiro ao mergulhar (rabo para cima)
  const cast = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  root.add(cast(new THREE.Mesh(bodyGeometry(male), FEATHERS)));
  // velas à parte, sem o brilho de pena (que as deixava cinzentas vistas de lado)
  if (male) root.add(cast(new THREE.Mesh(mergeGeometries([sailGeometry(1), sailGeometry(-1)]), SAIL)));

  const neck = new THREE.Group();
  neck.position.set(0, 0.052, 0.1);
  root.add(neck);
  const neckG = new THREE.CylinderGeometry(0.026, 0.036, 0.06, 14).translate(0, 0.03, 0);
  const nc = C(male ? 0x5b2a3a : 0x80776c);
  const ncol = new Float32Array(neckG.attributes.position.count * 3).map((_, i) => [nc.r, nc.g, nc.b][i % 3]);
  neckG.setAttribute('color', new THREE.BufferAttribute(ncol, 3));
  neck.add(cast(new THREE.Mesh(neckG, FEATHERS)));
  // cabeça inteira (crânio, crista, barba, bico, olhos) numa malha só, com as
  // cores nos vértices: 1 chamada em vez de 7 (cada uma é desenhada também no
  // reflexo do lago e na sombra)
  const head = new THREE.Group();
  head.position.set(0, 0.062, 0.018);
  const parts = [headGeometry(male)];
  if (male) parts.push(crestGeometry(), ruffGeometry());
  parts.push(paintGeometry(new THREE.ConeGeometry(0.012, 0.034, 12).rotateX(Math.PI / 2).scale(1, 0.62, 1).translate(0, -0.006, 0.062), male ? 0xd02e28 : 0x4a4440));
  parts.push(paintGeometry(new THREE.SphereGeometry(0.0042, 8, 6).translate(0, -0.006, 0.078), 0xf0e0c8));
  for (const sx of [-1, 1]) parts.push(paintGeometry(new THREE.SphereGeometry(0.0062, 10, 8).translate(sx * 0.034, 0.012, 0.022), 0x140c08));
  const flat = parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; });
  head.add(cast(new THREE.Mesh(mergeGeometries(flat), FEATHERS)));
  neck.add(head);

  // ----- comportamento -----
  const st = { mode: 'swim', time: 1 + R() * 3, yaw: 0, yawT: 0, pitch: 0, pitchT: 0, headPitch: 0, body: 0, bodyT: 0, ph: R() * 10 };
  const ACTIONS = ['look', 'look', 'dabble', 'preen', 'shake', 'drink'];
  const headWorld = new THREE.Vector3();
  function update(dt, t, ud) {
    st.time -= dt;
    let shake = 0;
    if (st.mode === 'swim') {
      st.yawT = Math.sin(t * 0.3 + st.ph) * 0.25;
      st.pitchT = 0; st.bodyT = 0; st.headPitchT = 0;
      if (st.time <= 0) {
        st.mode = ACTIONS[Math.floor(R() * ACTIONS.length)];
        st.time = { look: 2 + R() * 2, dabble: 1.6 + R() * 1.6, preen: 2.5 + R() * 2, shake: 0.7, drink: 2.2 }[st.mode];
        st.dir = R() < 0.5 ? -1 : 1;
        st.splashed = false;
      }
    } else if (st.mode === 'look') {
      st.yawT = st.dir * 0.9;
    } else if (st.mode === 'dabble') {
      // cabeça na água, rabo para cima
      st.yawT = 0; st.pitchT = 1.7; st.bodyT = 0.85; st.headPitchT = 0.3;
      if (!st.splashed && st.body > 0.6) {
        st.splashed = true;
        head.getWorldPosition(headWorld);
        ud.splash = { x: headWorld.x, z: headWorld.z, s: 0.5 };
      }
    } else if (st.mode === 'preen') {
      // vira a cabeça para trás e "mordisca" as penas
      st.yawT = st.dir * 2.5; st.pitchT = 0.7; st.headPitchT = 0.6 + Math.sin(t * 9) * 0.15;
    } else if (st.mode === 'shake') {
      shake = Math.sin(t * 45) * 0.45 * Math.sin((st.time / 0.7) * Math.PI);
    } else if (st.mode === 'drink') {
      // encosta o bico na água e depois ergue a cabeça para engolir
      const f = 1 - st.time / 2.2;
      st.pitchT = f < 0.45 ? 1.15 : -0.35; st.headPitchT = f < 0.45 ? 0.5 : -0.5;
      if (!st.splashed && f > 0.3) {
        st.splashed = true;
        head.getWorldPosition(headWorld);
        ud.splash = { x: headWorld.x, z: headWorld.z, s: 0.25 };
      }
    }
    if (st.mode !== 'swim' && st.time <= 0) { st.mode = 'swim'; st.time = 2.5 + R() * 5; }

    const k = Math.min(1, dt * (st.mode === 'dabble' ? 3.5 : 4));
    st.yaw += (st.yawT - st.yaw) * k;
    st.pitch += (st.pitchT - st.pitch) * k;
    st.body += (st.bodyT - st.body) * Math.min(1, dt * 3);
    st.headPitch += ((st.headPitchT ?? 0) - st.headPitch) * k;
    neck.rotation.order = 'YXZ';
    neck.rotation.y = st.yaw + shake;
    neck.rotation.x = st.pitch;
    head.rotation.x = st.headPitch;
    head.rotation.z = shake * 0.5;
    root.rotation.x = st.body;
    // remando: sobe e desce de leve, balança um pouco de lado
    root.position.y = Math.sin(t * 2.2 + st.ph) * 0.004 - st.body * 0.03;
    root.rotation.z = Math.sin(t * 1.7 + st.ph) * 0.03;
    return st.mode === 'dabble' || st.mode === 'preen' || st.mode === 'drink';
  }
  root.userData.duckState = st; // para testes no console
  return { root, update };
}

export function createDucks(seed = 1) {
  const group = new THREE.Group();
  const male = duck(true, seed * 3 + 1), female = duck(false, seed * 3 + 2);
  group.add(male.root, female.root);
  female.root.scale.setScalar(0.86);
  const R = rng(seed);
  const ph = R() * 10;
  let wake = 0;
  const tail = new THREE.Vector3();
  group.userData.animate = (dt, t) => {
    const ud = group.userData;
    // a fêmea vai um pouco à frente; o macho a acompanha de perto, mudando de lado
    female.root.position.x = -0.12 + Math.sin(t * 0.13 + ph) * 0.05;
    female.root.position.z = 0.16;
    male.root.position.x = 0.15 + Math.sin(t * 0.17 + ph) * 0.12;
    male.root.position.z = -0.2 + Math.cos(t * 0.11 + ph) * 0.08;
    male.root.rotation.y = Math.sin(t * 0.17 + ph) * 0.2;
    const busyM = male.update(dt, t, ud);
    const busyF = female.update(dt, t, ud);
    ud.swimSpeed = busyM || busyF ? 0.015 : 0.14;
    // rastro: ondinhas atrás do casal enquanto nada
    wake -= dt;
    if (wake <= 0 && ud.swimSpeed > 0.05 && !ud.splash) {
      wake = 1.6 + Math.random();
      tail.set(0, 0, -0.35);
      group.localToWorld(tail);
      ud.splash = { x: tail.x, z: tail.z, s: 0.15 };
    }
  };
  group.userData.animate(0.016, 0);
  group.userData.splash = null;
  group.userData.radius = 0.45;
  group.userData.material = 'water';
  group.userData.swim = true;
  return group;
}
