// Salgueiro-chorão (Salix babylonica).
//
// Estrutura: tronco grosso e curto, com raízes que se abrem na base, que se
// divide em 4–6 galhos grandes. Eles sobem íngremes e se arqueiam para fora,
// como uma fonte; desses arcos saem galhos secundários, também em arco. Ao
// longo das partes externas e altas desses arcos nascem os raminhos: cada um
// sai um pouco para fora e cai numa cortina, afinando e clareando até a ponta.
// A copa resultante é uma cúpula pendente que deixa ver o céu entre os ramos.
//
// Os raminhos são instâncias de uma fita dupla (em cruz, ambas seguindo a curva
// do ramo) e balançam ao vento a partir do ponto de onde pendem.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, smoothstep } from '../core/noise.js';
import { applyWind } from '../core/materials.js';
import { taperedTube } from './trees.js';
import { getKit } from './kit.js';

// Raminho de comprimento 1 (escalado em y por instância): nasce em y=0, faz um
// pequeno arco para fora (+z, em metros) e cai. Duas fitas em cruz, afinando.
export function strandGeometry(segs = 8, colors = [0x6f9640, 0xcad872]) {
  const centre = (s) => new THREE.Vector3(0, -s + 0.05 * Math.sin(Math.PI * Math.min(s / 0.22, 1)), 0.32 * (1 - Math.pow(1 - Math.min(s / 0.32, 1), 2)) + s * 0.08);
  const parts = [];
  for (const mode of [0, 1]) {
    const pos = [], uv = [], col = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const s = i / segs;
      const p = centre(s);
      const q = centre(Math.min(1, s + 0.01));
      const tan = q.clone().sub(p).normalize();
      // fita 0: largura em x; fita 1: largura no plano yz, perpendicular à curva
      const side = mode === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, tan.z, -tan.y).normalize();
      const w = 0.11 * (1 - 0.55 * s);
      for (const k of [-1, 1]) {
        pos.push(p.x + side.x * w * k, p.y + side.y * w * k, p.z + side.z * w * k);
        uv.push(k > 0 ? 1 : 0, 1 - s * 4);
        // base verde mais funda, ponta mais nova e amarelada
        const c = new THREE.Color(colors[0]).lerp(new THREE.Color(colors[1]), smoothstep(0.1, 1, s));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

// Galho em arco: sobe na direção `dir` (com inclinação `rise`) e depois se
// curva para baixo. Devolve a curva.
export function archCurve(start, dir, len, rise, droop, R) {
  const pts = [start.clone()];
  const p = start.clone();
  const n = 6;
  for (let k = 1; k <= n; k++) {
    const f = k / n;
    const up = rise * (1 - f * 1.3) - droop * f * f; // sobe e depois pende
    const d = new THREE.Vector3(dir.x, up, dir.z).normalize();
    d.x += (R() - 0.5) * 0.15; d.z += (R() - 0.5) * 0.15;
    p.addScaledVector(d.normalize(), len / n);
    pts.push(p.clone());
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function createWillow(seed = 1, { size = 1, strands = 1700 } = {}) {
  const kit = getKit();
  const R = rng(seed);
  const group = new THREE.Group();
  const wood = [];
  const attach = []; // { p, out: direção para fora, w: peso }

  // tronco curto e grosso, um pouco inclinado, com raízes na base
  const lean = new THREE.Vector3((R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6);
  const trunk = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.3, 0),
    new THREE.Vector3(lean.x * 0.3, 1.1, lean.z * 0.3),
    new THREE.Vector3(lean.x * 0.7, 2.2, lean.z * 0.7),
    new THREE.Vector3(lean.x, 3.1, lean.z),
  ]);
  wood.push(taperedTube(trunk, 24, 16, 0.55, 0.34, 1.1));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + R();
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const root = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.45, 0).addScaledVector(out, 0.15),
      new THREE.Vector3(0, 0.12, 0).addScaledVector(out, 0.55),
      new THREE.Vector3(0, -0.15, 0).addScaledVector(out, 0.95 + R() * 0.3),
    ]);
    wood.push(taperedTube(root, 8, 7, 0.17, 0.05));
  }

  // galhos principais: sobem e se arqueiam para fora
  const top = trunk.getPointAt(1);
  const nMain = 4 + Math.floor(R() * 3);
  for (let i = 0; i < nMain; i++) {
    const a = (i / nMain) * Math.PI * 2 + R() * 0.6;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const start = trunk.getPointAt(0.82 + R() * 0.18);
    const len = 4.8 + R() * 2.6;
    const main = archCurve(start, dir, len, 1.4 + R() * 1.4, 2.2 + R() * 1.0, R);
    wood.push(taperedTube(main, 22, 10, 0.17, 0.025));
    // galhos secundários, saindo da metade de cima em arcos menores
    for (let k = 0; k < 4; k++) {
      const t = 0.35 + k * 0.17 + R() * 0.06;
      const s = main.getPointAt(t);
      const side = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (R() - 0.5) * 1.8);
      const sub = archCurve(s, side, 2 + R() * 1.6, 1.1 + R() * 0.6, 1.8, R);
      wood.push(taperedTube(sub, 10, 6, 0.05, 0.01));
      for (let m = 0; m < 10; m++) attach.push({ curve: sub, t: 0.25 + (m / 10) * 0.75, out: side });
    }
    for (let m = 0; m < 16; m++) attach.push({ curve: main, t: 0.2 + (m / 16) * 0.8, out: dir });
  }
  // guia central, mais alto: dá o topo arredondado da copa
  const leaders = [];
  for (let i = 0; i < 3; i++) {
    const a = R() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const lead = archCurve(top, dir, 5 + R() * 1.5, 5, 1.4, R);
    wood.push(taperedTube(lead, 14, 8, 0.12, 0.02));
    leaders.push(lead);
    for (let m = 0; m < 22; m++) attach.push({ curve: lead, t: 0.12 + (m / 22) * 0.88, out: dir, short: true });
  }
  const woodMesh = new THREE.Mesh(mergeGeometries(wood), kit.barkMat);
  woodMesh.castShadow = woodMesh.receiveShadow = true;
  group.add(woodMesh);

  // raminhos pendentes
  const tex = kit.willowStrand;
  globalThis.__willowTex = tex; // usado pelo scripts/bench.js
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  const mat = applyWind(new THREE.MeshStandardMaterial({
    map: tex, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.6,
  }), { mode: 'hang', height: 1, amp: 0.38, power: 1.5, flutter: 0.022 });
  // luz atravessando as folhinhas finas, como acontece com o salgueiro contra o sol
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.07;');
  };
  const mesh = new THREE.InstancedMesh(strandGeometry(), mat, strands);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  const Y = new THREE.Vector3(0, 1, 0);
  let n = 0;
  for (let i = 0; i < strands; i++) {
    const a = attach[Math.floor(R() * attach.length)];
    a.curve.getPointAt(Math.min(1, a.t + (R() - 0.5) * 0.08), p);
    p.x += (R() - 0.5) * 0.35; p.z += (R() - 0.5) * 0.35; p.y += (R() - 0.5) * 0.15;
    // cai quase até a água (os de fora e de baixo um pouco mais curtos que o chão)
    // os de cima e de dentro são mais curtos (formam a cúpula); os de fora descem até a água
    const len = a.short && R() < 0.7 ? 0.8 + R() * 1.4 : Math.max(0.8, p.y - 0.15 - R() * 1.6);
    // vira o raminho para fora da copa, com variação
    const outward = Math.atan2(p.x - top.x, p.z - top.z) + (R() - 0.5) * 0.9;
    q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.15, outward, (R() - 0.5) * 0.15, 'YXZ'));
    m4.compose(p, q, s.set(0.8 + R() * 0.5, len, 0.7 + R() * 0.6));
    mesh.setMatrixAt(n, m4);
    mesh.setColorAt(n, col.setHSL(0.2 + (R() - 0.5) * 0.04, 0.3, 0.82 + R() * 0.25));
    n++;
  }
  mesh.count = n;
  group.add(mesh);
  group.scale.setScalar(size);
  group.userData.radius = 4 * size;
  return group;
}
