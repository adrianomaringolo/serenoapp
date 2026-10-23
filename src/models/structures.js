// Construções do jardim: deck de madeira (engawa) com almofada de meditação e
// incenso, meio-fio de pedra da areia e o shishi-odoshi (bambu que enche de
// água, vira e bate na pedra: o "toc" que marca o tempo do jardim).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, smoothstep } from '../core/noise.js';
import { paintGeometry, globalUniforms } from '../core/materials.js';
import { culmGeometry } from './bamboo.js';
import { getKit } from './kit.js';

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------
export function createDeck({ x0, x1, z0, z1, height = 0.32 }) {
  const kit = getKit();
  const R = rng(91);
  const L = x1 - x0;
  const plankW = 0.19, gap = 0.012, th = 0.045;
  const geos = [];
  let k = 0;
  for (let z = z0; z + plankW <= z1 + 0.001; z += plankW + gap, k++) {
    const g = new THREE.BoxGeometry(L + (R() - 0.5) * 0.04, th, plankW);
    const uv = g.attributes.uv;
    const row = (k % 4) / 4;
    const off = R();
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (L / 2.2) + off, row + 0.01 + uv.getY(i) * 0.23);
    g.translate((x0 + x1) / 2, height - th / 2 + (R() - 0.5) * 0.004, z + plankW / 2);
    geos.push(g);
  }
  const top = new THREE.Mesh(mergeGeometries(geos), kit.woodMat);
  top.castShadow = top.receiveShadow = true;

  const frame = [];
  const beam = (w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) / 2.2, 0.5 + uv.getY(i) * 0.2);
    g.translate(x, y, z);
    frame.push(g);
  };
  const by = height - th - 0.06;
  beam(L + 0.1, 0.12, 0.12, (x0 + x1) / 2, by, z0 + 0.06);
  beam(L + 0.1, 0.12, 0.12, (x0 + x1) / 2, by, z1 - 0.06);
  for (const x of [x0 + 0.08, (x0 + x1) / 2, x1 - 0.08]) {
    for (const z of [z0 + 0.06, z1 - 0.06]) beam(0.12, by + 0.05, 0.12, x, (by + 0.05) / 2 - 0.05, z);
  }
  const frameMesh = new THREE.Mesh(mergeGeometries(frame), kit.woodMat);
  frameMesh.castShadow = frameMesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(top, frameMesh);
  return { group, surface: top, height };
}

// Almofadas de meditação: zabuton (esteira) e zafu (almofada redonda pregueada).
export function createCushion() {
  const group = new THREE.Group();
  const fabric = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.95, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x8890b0) });
  const mat = new THREE.Mesh(new RoundedBoxGeometry(0.78, 0.06, 0.78, 4, 0.025), fabric(0x3a2f2b));
  mat.position.y = 0.03;
  mat.castShadow = mat.receiveShadow = true;
  group.add(mat);
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const a = t * Math.PI;
    pts.push(new THREE.Vector2(0.2 + Math.sin(a) * 0.03, 0.07 - Math.cos(a) * 0.07));
  }
  pts.unshift(new THREE.Vector2(0, 0));
  pts.push(new THREE.Vector2(0, 0.14));
  const zg = new THREE.LatheGeometry(pts, 64);
  const pos = zg.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const r = Math.hypot(x, z);
    const s = 1 + Math.sin(a * 24) * 0.02 * smoothstep(0.1, 0.22, r);
    pos.setX(i, x * s);
    pos.setZ(i, z * s);
  }
  zg.computeVertexNormals();
  const zafu = new THREE.Mesh(zg, fabric(0x273150));
  zafu.position.set(0, 0.06, -0.1);
  zafu.castShadow = zafu.receiveShadow = true;
  group.add(zafu);
  return group;
}

// Incenso com fumaça subindo em espiral (partículas calculadas no shader).
export function createIncense() {
  const kit = getKit();
  const group = new THREE.Group();
  const bowlG = new THREE.LatheGeometry(
    [[0, 0], [0.05, 0], [0.075, 0.02], [0.085, 0.05], [0.08, 0.055], [0.07, 0.04], [0, 0.04]].map(([x, y]) => new THREE.Vector2(x, y)), 28,
  );
  const bowl = new THREE.Mesh(bowlG, new THREE.MeshPhysicalMaterial({ color: 0x2c3a4a, roughness: 0.25, clearcoat: 0.8 }));
  bowl.castShadow = true;
  group.add(bowl);
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 1 }));
  ash.position.y = 0.045;
  group.add(ash);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.22, 5), new THREE.MeshStandardMaterial({ color: 0x5a2a1a, roughness: 0.9 }));
  stick.position.y = 0.045 + 0.11;
  stick.rotation.z = 0.06;
  group.add(stick);
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.2, 0.3) }));
  ember.position.set(-0.0066, 0.045 + 0.22, 0);
  group.add(ember);

  const N = 70;
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) seeds[i] = i / N;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const smoke = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uTime: globalUniforms.uTime, uMap: { value: kit.blob }, uColor: { value: new THREE.Color(0xd8d4cf) }, uScale: globalUniforms.uPointScale },
    vertexShader: /* glsl */ `
      uniform float uTime, uScale;
      attribute float aSeed;
      varying float vA;
      varying float vR;
      void main() {
        float life = fract(uTime * 0.09 + aSeed);
        float y = life * 1.3;
        float sw = sin(life * 7.0 + uTime * 0.6) * 0.06 * life + sin(life * 15.0 + uTime) * 0.012;
        vec3 p = vec3(sw + life * life * 0.15, y, cos(life * 5.0 + uTime * 0.4) * 0.04 * life);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.02 + life * 0.22) * uScale / -mv.z;
        vA = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.4, 1.0, life)) * 0.22;
        vR = aSeed * 6.28;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      varying float vA;
      varying float vR;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float s = sin(vR), co = cos(vR);
        c = mat2(co, -s, s, co) * c;
        float a = texture2D(uMap, c + 0.5).a * vA;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
  }));
  smoke.position.copy(ember.position);
  smoke.frustumCulled = false;
  group.add(smoke);
  group.userData.smoke = smoke;
  group.userData.radius = 0.12;
  return group;
}

// ---------------------------------------------------------------------------
// Meio-fio de pedra em volta da areia
// ---------------------------------------------------------------------------
export function createCurbs({ x0, x1, z0, z1 }) {
  const kit = getKit();
  const R = rng(73);
  const geos = [];
  const add = (cx, cz, along, rotY) => {
    const len = 0.5 + R() * 0.25;
    const g = new THREE.BoxGeometry(len, 0.14 + R() * 0.03, 0.22, 3, 1, 1);
    paintGeometry(g, 0x8a867e, (c) => c.multiplyScalar(0.8 + R() * 0.3));
    g.rotateY(rotY + (R() - 0.5) * 0.03);
    g.translate(cx, 0.05, cz);
    geos.push(g);
    return len;
  };
  for (const [ax, bx, z, rot] of [[x0, x1, z0 - 0.12, 0], [x0, x1, z1 + 0.12, 0]]) {
    for (let x = ax - 0.1; x < bx + 0.1;) { const l = add(x + 0.3, z, true, rot); x += l + 0.015; }
  }
  for (const [az, bz, x] of [[z0, z1, x0 - 0.12], [z0, z1, x1 + 0.12]]) {
    for (let z = az + 0.12; z < bz - 0.1;) { const l = add(x, z + 0.3, true, Math.PI / 2); z += l + 0.015; }
  }
  const m = new THREE.Mesh(mergeGeometries(geos), kit.stoneFine);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Shishi-odoshi
// ---------------------------------------------------------------------------
export function createShishiOdoshi() {
  const group = new THREE.Group();
  const bambooMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38 });
  const oldColors = { colors: [0x9a8a52, 0xc2ae6a], old: true };

  const tube = (len, r, nodes = 2) => {
    const g = culmGeometry({ nodes, radius: r, ...oldColors });
    g.scale(1, len, 1);
    return g;
  };

  // postes e eixo
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(tube(0.42, 0.035, 2), bambooMat);
    post.position.set(sx * 0.1, 0, 0.02);
    post.castShadow = true;
    group.add(post);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a2c1c }));
  axle.position.set(0, 0.3, 0.02);
  group.add(axle);

  // balancim: tubo deitado, boca (frente, +z) cortada em bisel
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.3, 0.02);
  const rockerG = tube(0.95, 0.05, 2);
  rockerG.rotateX(Math.PI / 2);
  rockerG.translate(0, 0, -0.32);
  // bisel: puxa os vértices da ponta da frente conforme a altura
  const rp = rockerG.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const z = rp.getZ(i), y = rp.getY(i);
    if (z > 0.55) rp.setZ(i, 0.55 + (z - 0.55) * (0.5 - y * 8));
  }
  rockerG.computeVertexNormals();
  const rocker = new THREE.Mesh(rockerG, bambooMat);
  rocker.castShadow = true;
  pivot.add(rocker);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), new THREE.MeshStandardMaterial({ color: 0x241c10, roughness: 1 }));
  inner.position.z = 0.6;
  pivot.add(inner);
  group.add(pivot);

  // bica que alimenta a água, presa num poste mais alto atrás
  const feedPost = new THREE.Mesh(tube(0.95, 0.04, 3), bambooMat);
  feedPost.position.set(0.44, 0, 0.5);
  feedPost.castShadow = true;
  group.add(feedPost);
  const spoutG = tube(0.45, 0.022, 1);
  spoutG.rotateZ(Math.PI / 2 + 0.25);
  const spout = new THREE.Mesh(spoutG, bambooMat);
  spout.position.set(0.44, 0.86, 0.5);
  spout.castShadow = true;
  group.add(spout);
  const stream = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.01, 0.24, 6, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xcfe6f0, transparent: true, opacity: 0.45, roughness: 0.05, emissive: 0x334455, emissiveIntensity: 0.2 }),
  );
  stream.position.set(0, 0.62, 0.5);
  group.add(stream);

  // pedra onde o tubo bate
  const strikeStone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 1), getKit().stoneFine);
  paintGeometry(strikeStone.geometry, 0x6c6a64);
  strikeStone.scale.set(1.2, 0.7, 1);
  strikeStone.position.set(0, 0.09, -0.3);
  strikeStone.castShadow = strikeStone.receiveShadow = true;
  group.add(strikeStone);

  // ciclo: enche devagar → vira → despeja → volta e bate ("toc")
  const REST = -0.3, TIP = 0.62;
  let phase = 'fill', t = Math.random() * 8, angle = REST;
  const fillTime = 11;
  let onKnock = null;
  let onPour = null;
  function trigger() {
    if (phase === 'fill') { phase = 'tip'; t = 0; }
  }
  function update(dt) {
    t += dt;
    if (phase === 'fill') {
      const k = Math.min(t / fillTime, 1);
      angle = REST + (0.05 - REST) * k * k;
      if (k >= 1) { phase = 'tip'; t = 0; }
    } else if (phase === 'tip') {
      angle += (TIP - angle) * Math.min(1, dt * 9);
      if (t > 0.5) { phase = 'pour'; t = 0; onPour?.(); }
    } else if (phase === 'pour') {
      if (t > 0.6) { phase = 'return'; t = 0; }
    } else if (phase === 'return') {
      angle += (REST - angle) * Math.min(1, dt * 14) - dt * 0.6;
      if (angle <= REST) {
        angle = REST;
        phase = 'bounce'; t = 0;
        onKnock?.();
      }
    } else if (phase === 'bounce') {
      angle = REST + Math.sin(Math.min(t / 0.35, 1) * Math.PI) * 0.06 * Math.exp(-t * 3);
      if (t > 0.6) { phase = 'fill'; t = 0; angle = REST; }
    }
    pivot.rotation.x = angle;
    stream.scale.y = 0.9 + Math.sin(performance.now() * 0.03) * 0.05;
  }
  group.userData.radius = 0.6;
  return {
    group, update, trigger,
    set onKnock(fn) { onKnock = fn; },
    set onPour(fn) { onPour = fn; },
  };
}
