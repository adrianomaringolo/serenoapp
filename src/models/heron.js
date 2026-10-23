// Garça-branca (Ardea alba), com esqueleto simples e comportamento:
//  - parada: olha em volta devagar, de vez em quando inclina a cabeça
//  - andando: passos lentos e altos no raso, o corpo balança a cada passo
//  - caçando: espreita a água com o pescoço esticado, congela… e dá o bote
//
// O pescoço é uma cadeia de segmentos cuja pose (ângulos em relação à
// vertical, no plano do corpo) é misturada entre poses-chave. As pernas usam
// cinemática inversa de dois ossos (joelho para trás, como nas aves), então os
// pés ficam plantados no fundo enquanto o corpo avança.
//
// Coordenadas locais: y = 0 é a superfície da água; a garça olha para +z.
// O deslocamento no lago é do ambiente (que sabe onde há água livre): a garça
// só pede, via userData.moveSpeed / userData.turn, e avisa o bote em
// userData.splash.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, smoothstep } from '../core/noise.js';
import { paintGeometry, bakeGroup } from '../core/materials.js';

const FEATHER = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.75, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff) });
const LEG = new THREE.MeshStandardMaterial({ color: 0x1c1b19, roughness: 0.55 });

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

// branco com sombreado: a barriga e as dobras um pouco mais cinzas
function whiten(geo, shade = (y) => 1) {
  return paintGeometry(geo, 0xffffff, (c, x, y, z) => {
    const s = shade(x, y, z);
    c.setRGB(0.97 * s, 0.965 * s, 0.94 * s);
    return c;
  });
}

// Corpo em gota (ao longo de z), achatado dos lados.
function bodyGeometry() {
  const prof = [[0, -0.25], [0.022, -0.22], [0.055, -0.15], [0.085, -0.06], [0.096, 0.02], [0.09, 0.08], [0.068, 0.13], [0.04, 0.165], [0, 0.18]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 22);
  g.rotateX(Math.PI / 2); // eixo do torno vira o eixo z (peito em +z)
  g.scale(0.82, 1, 1);
  return whiten(g, (x, y) => 0.82 + 0.18 * smoothstep(-0.08, 0.06, y));
}

// Asa dobrada: casca alongada colada ao flanco, com as pontas (primárias)
// passando por cima da cauda e franjas de penas na borda de trás.
function wingGeometry(side) {
  const g = new THREE.SphereGeometry(1, 18, 12, 0, Math.PI);
  g.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
  g.scale(0.035, 0.075, 0.2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i), y = pos.getY(i);
    // estica a parte de trás para baixo e para fora: as pontas das asas
    if (z < 0) {
      const k = -z / 0.2;
      pos.setZ(i, z - k * k * 0.09);
      pos.setY(i, y - k * k * 0.02);
      // franja: dentes nas penas da borda
      if (y < -0.02) pos.setZ(i, pos.getZ(i) - Math.max(0, Math.sin(y * 260)) * 0.012 * k);
    }
  }
  g.translate(side * 0.06, 0.012, -0.03);
  g.computeVertexNormals();
  return whiten(g, (x, y, z) => 0.88 + 0.1 * smoothstep(-0.05, 0.05, y) - (z < -0.2 ? 0.05 : 0));
}

// Plumas de reprodução: fios finos que saem das costas e caem além da cauda.
function plumesGeometry(R) {
  const parts = [];
  for (let i = 0; i < 14; i++) {
    const sx = (R() - 0.5) * 0.06;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx, 0.05, 0.02),
      new THREE.Vector3(sx * 1.4, 0.07, -0.12),
      new THREE.Vector3(sx * 1.8, 0.03, -0.3),
      new THREE.Vector3(sx * 2.2, -0.04 - R() * 0.04, -0.42 - R() * 0.06),
    ]);
    parts.push(new THREE.TubeGeometry(curve, 12, 0.0018, 3));
  }
  return whiten(mergeGeometries(parts));
}

// Poses do pescoço: ângulo absoluto (rad, a partir da vertical, + = frente)
// de cada um dos 8 segmentos, e o ângulo da cabeça (π/2 = bico na horizontal).
const POSES = {
  rest: { neck: [0.7, 0.4, -0.15, -0.5, -0.4, 0.1, 0.7, 1.15], head: Math.PI / 2 },
  retract: { neck: [1.15, 0.55, -0.6, -1.05, -0.7, 0.35, 1.25, 1.6], head: 1.65 },
  stalk: { neck: [1.0, 0.95, 0.75, 0.55, 0.6, 0.95, 1.4, 1.8], head: 2.35 },
  strike: { neck: [1.7, 2.05, 2.3, 2.45, 2.55, 2.62, 2.68, 2.72], head: 2.95 },
};
const SEG_L = 0.056;
const SEG_R = [0.03, 0.026, 0.023, 0.02, 0.018, 0.016, 0.015, 0.014];

export function createHeron(seed = 1) {
  const R = rng(seed * 5 + 7);
  const root = new THREE.Group();
  const cast = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  // corpo (inclinado, peito para cima) com asas, cauda e plumas
  const body = new THREE.Group();
  body.position.set(0, 0.46, 0);
  body.rotation.x = -0.45;
  body.add(cast(new THREE.Mesh(bodyGeometry(), FEATHER)));
  body.add(cast(new THREE.Mesh(wingGeometry(1), FEATHER)), cast(new THREE.Mesh(wingGeometry(-1), FEATHER)));
  const tail = new THREE.ConeGeometry(0.035, 0.09, 10).rotateX(-Math.PI / 2).scale(1.3, 0.45, 1).translate(0, -0.005, -0.27);
  body.add(cast(new THREE.Mesh(whiten(tail), FEATHER)));
  body.add(new THREE.Mesh(plumesGeometry(R), FEATHER));
  bakeGroup(body); // corpo, asas, cauda e plumas: uma malha só
  root.add(body);

  // pescoço: segmentos + esferas nas juntas (escondem as emendas). Os
  // segmentos são "fantasmas" (Object3D) para a conta da pose; o desenho é
  // feito por duas InstancedMesh — 2 chamadas em vez de 16.
  const neck = new THREE.Group();
  root.add(neck);
  const segMesh = cast(new THREE.InstancedMesh(whiten(new THREE.CylinderGeometry(0.88, 1, SEG_L, 10).translate(0, SEG_L / 2, 0)), FEATHER, 8));
  const jointMesh = cast(new THREE.InstancedMesh(whiten(new THREE.SphereGeometry(1, 10, 8)), FEATHER, 8));
  neck.add(segMesh, jointMesh);
  // as instâncias se mexem: a esfera envolvente calculada uma vez ficaria velha
  segMesh.frustumCulled = jointMesh.frustumCulled = false;
  const segs = SEG_R.map((r) => {
    const seg = new THREE.Object3D(), joint = new THREE.Object3D();
    seg.scale.set(r, 1, r);
    joint.scale.setScalar(r);
    return { seg, joint };
  });

  // cabeça: crânio, bico em adaga, mancha verde e olhos
  const head = new THREE.Group();
  head.rotation.order = 'YXZ';
  // tudo pintado por vértice e fundido numa malha só (1 chamada em vez de 8)
  const headParts = [whiten(new THREE.SphereGeometry(1, 16, 12).scale(0.024, 0.027, 0.042).translate(0, 0.004, 0.01))];
  headParts.push(paintGeometry(new THREE.ConeGeometry(0.011, 0.13, 10).rotateX(Math.PI / 2).scale(0.8, 1, 1).translate(0, -0.002, 0.105), 0xe3b23a));
  for (const sx of [-1, 1]) {
    headParts.push(paintGeometry(new THREE.SphereGeometry(0.009, 8, 6).scale(0.5, 0.8, 1.6).translate(sx * 0.016, 0.004, 0.038), 0x9fbf6a));
    headParts.push(paintGeometry(new THREE.SphereGeometry(0.0055, 10, 8).translate(sx * 0.018, 0.008, 0.027), 0xf0d24a));
    headParts.push(paintGeometry(new THREE.SphereGeometry(0.0028, 8, 6).translate(sx * 0.0215, 0.008, 0.028), 0x080806));
  }
  head.add(cast(new THREE.Mesh(mergeGeometries(headParts.map((g) => g.toNonIndexed())), FEATHER)));
  neck.add(head);
  const beakTip = new THREE.Vector3(0, -0.002, 0.17);

  // pernas: tíbia e tarso, juntas e um pezinho
  // (ossos em instâncias: 3 chamadas para as duas pernas)
  const boneMesh = cast(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.8, 1, 1, 6).translate(0, -0.5, 0), LEG, 4));
  const kneeMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 8, 6), LEG, 2);
  const footMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.006, 0.09).translate(0, 0, 0.025), LEG, 2);
  root.add(boneMesh, kneeMesh, footMesh);
  boneMesh.frustumCulled = kneeMesh.frustumCulled = footMesh.frustumCulled = false;
  const legs = [-1, 1].map((sx) => {
    const tibia = new THREE.Object3D(), tarsus = new THREE.Object3D(), knee = new THREE.Object3D(), foot = new THREE.Object3D();
    return { sx, tibia, tarsus, knee, foot, hip: new THREE.Vector3(sx * 0.038, 0.4, 0), a: 0.2, b: 0.32 };
  });

  // ----- estado -----
  const pose = { neck: [...POSES.rest.neck], head: POSES.rest.head };
  const st = { mode: 'stand', time: 2 + R() * 4, phase: 0, yaw: 0, yawTarget: 0, tilt: 0, sub: 0 };
  const lerpPose = (target, k) => {
    for (let i = 0; i < 8; i++) pose.neck[i] += (target.neck[i] - pose.neck[i]) * k;
    pose.head += (target.head - pose.head) * k;
  };
  const K = new THREE.Vector3(), F = new THREE.Vector3(), d = new THREE.Vector3(), p = new THREE.Vector3(), tmp = new THREE.Vector3();

  function solveLeg(L, footZ, footY) {
    F.set(L.hip.x, footY, L.hip.z + footZ);
    d.subVectors(F, L.hip);
    let dist = d.length();
    dist = Math.min(dist, L.a + L.b - 1e-3);
    // ângulo da linha quadril→pé a partir da vertical (no plano yz) e abertura do joelho
    const base = Math.atan2(d.z, -d.y);
    const alpha = Math.acos(THREE.MathUtils.clamp((L.a * L.a + dist * dist - L.b * L.b) / (2 * L.a * dist), -1, 1));
    // o joelho das aves (na verdade o tornozelo) aponta para trás
    const tib = base - alpha;
    K.set(L.hip.x, L.hip.y - Math.cos(tib) * L.a, L.hip.z + Math.sin(tib) * L.a);
    L.tibia.position.copy(L.hip);
    L.tibia.quaternion.setFromUnitVectors(DOWN, tmp.subVectors(K, L.hip).normalize());
    L.tibia.scale.set(0.0095, L.a, 0.0095);
    L.knee.position.copy(K);
    L.tarsus.position.copy(K);
    L.tarsus.quaternion.setFromUnitVectors(DOWN, tmp.subVectors(F, K).normalize());
    L.tarsus.scale.set(0.0075, K.distanceTo(F), 0.0075);
    L.foot.position.copy(F);
  }

  function layoutNeck(bob) {
    // base do pescoço no alto do peito; o pescoço todo gira (olhar para os lados)
    neck.position.set(0, 0.5 + bob, 0.13);
    neck.rotation.y = st.yaw;
    p.set(0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const a = pose.neck[i];
      const { seg, joint } = segs[i];
      seg.position.copy(p);
      joint.position.copy(p);
      tmp.set(0, Math.cos(a), Math.sin(a));
      seg.quaternion.setFromUnitVectors(UP, tmp);
      p.addScaledVector(tmp, SEG_L);
    }
    segs.forEach(({ seg, joint }, i) => {
      seg.updateMatrix(); joint.updateMatrix();
      segMesh.setMatrixAt(i, seg.matrix);
      jointMesh.setMatrixAt(i, joint.matrix);
    });
    segMesh.instanceMatrix.needsUpdate = jointMesh.instanceMatrix.needsUpdate = true;
    head.position.copy(p);
    head.rotation.x = pose.head - Math.PI / 2;
    head.rotation.y = st.tilt * 0.4;
    head.rotation.z = st.tilt * 0.5;
  }

  root.userData.animate = (dt, t, item) => {
    st.time -= dt;
    let speed = 0, bob = 0;
    const ud = root.userData;
    ud.turn = 0;

    if (st.mode === 'stand') {
      lerpPose(POSES.rest, dt * 1.5);
      // olha em volta: escolhe um ponto, vira o pescoço devagar, fica olhando
      if (Math.abs(st.yaw - st.yawTarget) < 0.02 && R() < dt * 0.4) st.yawTarget = (R() - 0.5) * 1.6;
      st.tilt += ((Math.sin(t * 0.6 + seed) > 0.8 ? 0.35 : 0) - st.tilt) * dt * 2;
      if (st.time <= 0) {
        const r = R();
        st.mode = r < 0.45 ? 'walk' : r < 0.85 ? 'stalk' : 'stand';
        st.time = st.mode === 'walk' ? 3 + R() * 5 : st.mode === 'stalk' ? 2.5 + R() * 2.5 : 3 + R() * 4;
        st.turnRate = (R() - 0.5) * 0.5;
      }
    } else if (st.mode === 'walk') {
      // passos lentos; o pescoço avança e recua um pouco a cada passo
      speed = 0.11;
      st.phase += dt * Math.PI * 2 * 0.7;
      lerpPose(POSES.rest, dt * 2);
      pose.neck[0] += Math.sin(st.phase * 2) * 0.004;
      bob = Math.abs(Math.sin(st.phase)) * 0.012 - 0.006;
      st.yawTarget = 0;
      ud.turn = ud.blocked ? 0.9 : st.turnRate;
      if (st.time <= 0) { st.mode = 'stand'; st.time = 2 + R() * 4; }
    } else if (st.mode === 'stalk') {
      // espreita: inclina, encara a água e congela
      st.yawTarget = 0;
      lerpPose(POSES.stalk, dt * 0.9);
      if (st.time <= 0) { st.mode = 'cock'; st.time = 0.6; }
    } else if (st.mode === 'cock') {
      // recolhe o pescoço como uma mola…
      lerpPose(POSES.retract, dt * 5);
      if (st.time <= 0) { st.mode = 'strike'; st.time = 0.18; st.sub = 0; }
    } else if (st.mode === 'strike') {
      // …e dispara
      lerpPose(POSES.strike, Math.min(1, dt * 22));
      if (st.time <= 0 && !st.sub) {
        st.sub = 1;
        head.updateWorldMatrix(true, false);
        ud.splash = head.localToWorld(beakTip.clone());
        st.mode = 'swallow';
        st.time = 1.2;
      }
    } else if (st.mode === 'swallow') {
      // volta e engole: a cabeça sobe com um tranco
      lerpPose(POSES.rest, dt * 3);
      pose.head = POSES.rest.head - Math.max(0, Math.sin((1.2 - st.time) * 9)) * 0.35 * (st.time / 1.2);
      if (st.time <= 0) { st.mode = 'stand'; st.time = 3 + R() * 4; }
    }

    // agacha ao caçar: o bico precisa alcançar a água
    const crouchT = st.mode === 'stalk' ? -0.04 : st.mode === 'cock' || st.mode === 'strike' ? -0.09 : 0;
    st.crouch = (st.crouch ?? 0) + (crouchT - (st.crouch ?? 0)) * Math.min(1, dt * (st.mode === 'strike' ? 20 : 3));
    bob += st.crouch;
    st.yaw += (st.yawTarget - st.yaw) * Math.min(1, dt * 1.2);
    ud.moveSpeed = speed;
    body.position.y = 0.46 + bob;
    body.rotation.x = -0.45 + (st.mode === 'stalk' || st.mode === 'cock' || st.mode === 'strike' ? 0.25 : 0);
    layoutNeck(bob);

    // pernas: em pé ficam paradas; andando, um pé de cada vez sobe e vai à frente
    const stride = 0.09;
    legs.forEach((L, i) => {
      const ph = st.phase + i * Math.PI;
      const walking = st.mode === 'walk';
      const z = walking ? Math.sin(ph) * stride : (i ? 0.02 : -0.02);
      const lift = walking ? Math.max(0, Math.cos(ph)) * 0.16 : 0;
      solveLeg(L, z, -0.12 + lift + bob * 0.5);
      for (const o of [L.tibia, L.tarsus, L.knee, L.foot]) o.updateMatrix();
      boneMesh.setMatrixAt(i * 2, L.tibia.matrix);
      boneMesh.setMatrixAt(i * 2 + 1, L.tarsus.matrix);
      kneeMesh.setMatrixAt(i, L.knee.matrix);
      footMesh.setMatrixAt(i, L.foot.matrix);
    });
    boneMesh.instanceMatrix.needsUpdate = kneeMesh.instanceMatrix.needsUpdate = footMesh.instanceMatrix.needsUpdate = true;
  };

  root.userData.animate(0.016, 0, null);
  root.userData.radius = 0.4;
  root.userData.material = 'water';
  root.userData.walker = true;
  root.userData.heronState = st; // para testes no console
  return root;
}
