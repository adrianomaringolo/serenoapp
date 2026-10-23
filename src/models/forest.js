// Floresta antiga e úmida:
//  - cedro milenar (como os de Yakushima): tronco grosso, torcido e cheio de
//    calombos, raízes em contraforte agarradas ao chão, musgo subindo pelo
//    tronco e a copa lá no alto.
//  - tronco caído coberto de musgo.
//  - samambaias (frondes em arco, em instâncias, balançando ao vento).
//  - cogumelos que brilham de leve no escuro.
//  - ponte de troncos e tábuas sobre o riacho.
//  - barquinho de papel dobrado, para soltar na correnteza.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise, rng, smoothstep } from '../core/noise.js';
import { applyWind, bakeGroup, globalUniforms } from '../core/materials.js';
import { toTexture } from '../core/textures.js';
import { foliageBlob, taperedTube } from './trees.js';
import { getKit } from './kit.js';

// ---------------------------------------------------------------------------
// Casca com musgo: a casca do kit e, por cima, a textura do chão de musgo onde
// o atributo `aMoss` manda (topo de troncos caídos, pé e um lado das árvores).
// ---------------------------------------------------------------------------
let mossyBark = null;
export function mossyBarkMaterial() {
  if (mossyBark) return mossyBark;
  const kit = getKit();
  const m = new THREE.MeshStandardMaterial({
    map: kit.bark.map, normalMap: kit.bark.normalMap, normalScale: new THREE.Vector2(1.3, 1.3), vertexColors: true, roughness: 0.95,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMossMap = { value: kit.ground.map };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMoss;\nvarying float vMoss;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMoss = aMoss;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMossMap;\nvarying float vMoss;')
      .replace('#include <map_fragment>', `
        vec3 barkT = texture2D(map, vMapUv).rgb;
        vec3 mossT = texture2D(uMossMap, vMapUv * vec2(0.55, 0.9)).rgb * vec3(1.05, 1.12, 0.9);
        // a borda do musgo segue o relevo da casca: entra pelas frestas primeiro
        float mk = smoothstep(0.0, 1.0, vMoss * 1.6 - (barkT.r + barkT.g) * 0.6);
        diffuseColor.rgb *= mix(barkT, mossT, mk);`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, mk * 0.5));');
  };
  m.customProgramCacheKey = () => 'mossy-bark';
  mossyBark = m;
  return m;
}

// Tubo deformado: afina, ganha calombos e (no pé) contrafortes. Devolve a
// geometria com uv em metros (u ao longo, v em volta) e o atributo aMoss.
function gnarledTube(curve, { tubular, radial, r0, r1, seed, bumps = 0.16, buttress = 0, buttressH = 2.5, mossFn }) {
  const nz = createNoise(seed);
  const frames = curve.computeFrenetFrames(tubular, false);
  const len = curve.getLength();
  const pos = [], uv = [], moss = [], col = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  const lobes = 4 + (seed % 3), lobePh = (seed * 1.7) % 6.28;
  const around = Math.max(1, Math.round((Math.PI * 2 * r0) / 1.6)); // repetições da casca em volta
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, P);
    const y = t * len;
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const s = Math.sin(a), c = -Math.cos(a);
      N.set(0, 0, 0).addScaledVector(frames.normals[i], c).addScaledVector(frames.binormals[i], s).normalize();
      const ca = Math.cos(a), sa = Math.sin(a);
      let k = 1 + nz.fbm3(ca * 1.3, y * 0.22, sa * 1.3, 3) * bumps + Math.abs(nz.n3(ca * 3, y * 0.9, sa * 3)) * bumps * 0.5;
      if (buttress) {
        const lobe = Math.pow(Math.max(0, Math.cos(a * lobes + lobePh + nz.n2(y * 0.3, 1) * 0.8)), 3);
        k += buttress * lobe * Math.pow(Math.max(0, 1 - y / buttressH), 2.2) + buttress * 0.35 * Math.pow(Math.max(0, 1 - y / buttressH), 3);
      }
      const rr = r * k;
      const x = P.x + rr * N.x, yy = P.y + rr * N.y, z = P.z + rr * N.z;
      pos.push(x, yy, z);
      uv.push(y * 0.8, (j / radial) * around);
      moss.push(mossFn ? mossFn(x, yy, z, N, t, nz) : 0);
      // frestas entre contrafortes mais escuras
      const ao = 0.7 + 0.3 * Math.min(1, k - 0.85);
      col.push(ao, ao, ao);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aMoss', new THREE.Float32BufferAttribute(moss, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Cedro milenar
// ---------------------------------------------------------------------------
// groundAt(dx, dz): altura do chão relativa ao pé da árvore (para as raízes)
// far: versão leve para o fundo (menos segmentos, poucas raízes, copa simples)
export function createAncientCedar(seed = 1, { size = 1, height = 20, groundAt = () => 0, crown = true, far = false } = {}) {
  const R = rng(seed * 17 + 3);
  const group = new THREE.Group();
  const mat = mossyBarkMaterial();
  const r0 = (0.95 + R() * 0.5) * size, r1 = r0 * (0.32 + R() * 0.1);
  const h = height * (0.85 + R() * 0.3);
  const lean = new THREE.Vector3((R() - 0.5) * 1.6, 0, (R() - 0.5) * 1.6);
  const pts = [];
  for (let k = 0; k <= 6; k++) {
    const f = k / 6;
    pts.push(new THREE.Vector3(
      lean.x * f * f + Math.sin(f * 5 + seed) * 0.35 * size,
      -0.6 + f * h,
      lean.z * f * f + Math.cos(f * 4 + seed) * 0.35 * size,
    ));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  // o musgo sobe mais de um lado (o lado úmido) e cobre o pé
  const wet = R() * Math.PI * 2;
  const mossFn = (x, y, z, N, t, nz) => {
    const side = 0.5 + 0.5 * (Math.cos(wet) * N.x + Math.sin(wet) * N.z);
    const base = 1 - smoothstep(2.5, 8 + side * 7, y);
    const patch = smoothstep(-0.1, 0.3, nz.fbm3(x * 0.5, y * 0.3, z * 0.5, 3) + side * 0.35 - 0.05);
    return Math.min(1, base * 1.2 + patch * 0.85 * (1 - smoothstep(11, 18, y)) + Math.max(0, N.y) * 0.6);
  };
  const geos = [gnarledTube(curve, { tubular: far ? 16 : 40, radial: far ? 12 : 28, r0, r1, seed, bumps: 0.18, buttress: 0.9, buttressH: 3.2 * size, mossFn })];

  // raízes em contraforte: saem do pé, abrem-se e mergulham no chão
  const nr = far ? 3 : 5 + Math.floor(R() * 3);
  for (let i = 0; i < nr; i++) {
    const a = (i / nr) * Math.PI * 2 + R() * 0.5;
    const ca = Math.cos(a), sa = Math.sin(a);
    const reach = r0 * (1.6 + R() * 1.4);
    const ground = (d) => groundAt(ca * d, sa * d);
    const p0 = new THREE.Vector3(ca * r0 * 0.4, 0.9 * size + R() * 0.6, sa * r0 * 0.4);
    const p1 = new THREE.Vector3(ca * r0 * 1.05, ground(r0 * 1.05) + 0.35 * size, sa * r0 * 1.05);
    const p2 = new THREE.Vector3(ca * reach * 0.75, ground(reach * 0.75) + 0.08, sa * reach * 0.75);
    const p3 = new THREE.Vector3(ca * reach + (R() - 0.5) * 0.4, ground(reach) - 0.35, sa * reach + (R() - 0.5) * 0.4);
    geos.push(gnarledTube(new THREE.CatmullRomCurve3([p0, p1, p2, p3]), {
      tubular: far ? 6 : 14, radial: far ? 6 : 10, r0: r0 * (0.32 + R() * 0.12), r1: 0.06, seed: seed * 7 + i, bumps: 0.12,
      mossFn: (x, y, z, N) => 0.75 + Math.max(0, N.y) * 0.4,
    }));
  }
  const trunk = new THREE.Mesh(mergeGeometries(geos), mat);
  trunk.castShadow = trunk.receiveShadow = true;
  group.add(trunk);

  if (crown) {
    // galhos grossos no alto e a copa em nuvens escuras
    const kit = getKit();
    const branchGeos = [], pads = [];
    const nb = far ? 3 : 5 + Math.floor(R() * 3);
    for (let i = 0; i < nb; i++) {
      const t = 0.62 + (i / nb) * 0.33;
      const s = curve.getPointAt(t);
      const ang = i * 2.39 + R() * 0.8;
      const len = (3.5 + R() * 3) * size * (1.15 - t * 0.5);
      const e = s.clone().add(new THREE.Vector3(Math.cos(ang) * len, len * (0.25 + R() * 0.3), Math.sin(ang) * len));
      const mid = s.clone().lerp(e, 0.5).add(new THREE.Vector3(0, -0.5, 0));
      branchGeos.push(gnarledTube(new THREE.CatmullRomCurve3([s, mid, e]), {
        tubular: 8, radial: 7, r0: r1 * 0.75, r1: 0.08, seed: seed * 13 + i, bumps: 0.1,
        mossFn: (x, y, z, N) => Math.max(0, N.y) * 0.9,
      }));
      pads.push({ p: e, r: (2.0 + R() * 1.4) * size });
    }
    const top = curve.getPointAt(1);
    pads.push({ p: top.clone().add(new THREE.Vector3(0, 1.2, 0)), r: 2.6 * size });
    const branches = new THREE.Mesh(mergeGeometries(branchGeos), mat);
    branches.castShadow = true;
    group.add(branches);
    const padGeos = pads.map((pd, i) => {
      const g = foliageBlob(seed * 31 + i, pd.r * 1.3, pd.r * 0.6, pd.r * 1.15, { detail: far ? 2 : 3, colors: [0x1b3020, 0x3b5c33], lump: 0.42 });
      g.translate(pd.p.x, pd.p.y, pd.p.z);
      return g;
    });
    const fol = new THREE.Mesh(mergeGeometries(padGeos), kit.foliage);
    fol.castShadow = true;
    fol.receiveShadow = true;
    group.add(fol);
  }
  group.userData.radius = r0 * 2;
  return group;
}

// ---------------------------------------------------------------------------
// Tronco caído, com musgo por cima. from/to: pontas no mundo (y = chão).
// ---------------------------------------------------------------------------
export function createFallenLog(seed, from, to, { radius = 0.45 } = {}) {
  const R = rng(seed * 5 + 1);
  const mid = from.clone().lerp(to, 0.5);
  mid.y += 0.15 + R() * 0.2;
  mid.x += (R() - 0.5) * 0.5; mid.z += (R() - 0.5) * 0.5;
  const curve = new THREE.CatmullRomCurve3([from, mid, to]);
  const g = gnarledTube(curve, {
    tubular: 30, radial: 16, r0: radius, r1: radius * 0.75, seed, bumps: 0.1,
    mossFn: (x, y, z, N, t, nz) => smoothstep(-0.25, 0.45, N.y + nz.fbm3(x * 0.8, y, z * 0.8, 2) * 0.5),
  });
  const group = new THREE.Group();
  const log = new THREE.Mesh(g, mossyBarkMaterial());
  log.castShadow = log.receiveShadow = true;
  group.add(log);
  // pontas: madeira clara com anéis, a de cima quebrada (cone irregular)
  const ringMat = getKit().painted;
  for (const [t, sgn] of [[0, -1], [1, 1]]) {
    const p = curve.getPointAt(t), d = curve.getTangentAt(t).multiplyScalar(sgn);
    const r = t ? radius * 0.75 : radius;
    const cap = new THREE.CircleGeometry(r * 1.02, 16);
    const col = [];
    const pa = cap.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const rr = Math.hypot(pa.getX(i), pa.getY(i)) / r;
      const v = 0.3 + 0.07 * Math.sin(rr * 26) + 0.08 * (1 - rr) - 0.12 * smoothstep(0.85, 1, rr);
      col.push(v * 1.2, v * 0.92, v * 0.62);
    }
    cap.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    cap.lookAt(d);
    cap.translate(p.x, p.y, p.z);
    const m = new THREE.Mesh(cap, ringMat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Samambaia
// ---------------------------------------------------------------------------
// Fronde: haste central e folíolos que diminuem até a ponta, em alfa.
let fernTex = null;
function fernTexture() {
  if (fernTex) return fernTex;
  const w = 128, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const R = rng(77);
  ctx.translate(w / 2, h);
  const pinnae = 22;
  for (let i = 0; i < pinnae; i++) {
    const t = (i + 0.6) / pinnae;
    const y = -t * h * 0.97;
    const len = w * 0.47 * Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.95)) * (1 - t * 0.35);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(0, y + side * 3);
      ctx.rotate(side * (1.05 - t * 0.35));
      // folíolo: lâmina com lobinhos
      const lobes = 6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let k = 0; k <= lobes; k++) {
        const u = k / lobes;
        const wv = (1 - u) * len * 0.16 * (0.75 + 0.25 * Math.cos(k * Math.PI)) + 1;
        ctx.lineTo(-wv, -u * len);
      }
      for (let k = lobes; k >= 0; k--) {
        const u = k / lobes;
        const wv = (1 - u) * len * 0.16 * (0.75 + 0.25 * Math.cos(k * Math.PI)) + 1;
        ctx.lineTo(wv, -u * len);
      }
      ctx.closePath();
      const g = 150 + R() * 40;
      ctx.fillStyle = `rgb(${g * 0.62},${g},${g * 0.42})`;
      ctx.fill();
      ctx.restore();
    }
  }
  // haste
  ctx.strokeStyle = 'rgb(110,130,60)';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h * 0.99); ctx.stroke();
  fernTex = toTexture(c, { srgb: true, wrap: false });
  return fernTex;
}

// geometria da fronde: sobe e se curva para fora, um pouco em calha
let frondGeo = null;
function frondGeometry() {
  if (frondGeo) return frondGeo;
  const segs = 10;
  const g = new THREE.PlaneGeometry(0.5, 1, 2, segs);
  const pos = g.attributes.position;
  // percorre o arco: ângulo a partir da vertical cresce ao longo da fronde
  const arc = [];
  let y = 0, f = 0;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    arc.push([f, y]);
    const th = 0.45 + 1.5 * t;
    y += Math.cos(th) / segs;
    f += Math.sin(th) / segs;
  }
  const col = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), t = pos.getY(i) + 0.5;
    const k = Math.min(segs - 1, Math.floor(t * segs)), fr = t * segs - k;
    const a = arc[k], b = arc[k + 1];
    const ff = a[0] + (b[0] - a[0]) * fr, yy = a[1] + (b[1] - a[1]) * fr;
    pos.setXYZ(i, x, yy - Math.abs(x) * 0.25, ff);
    const v = 0.55 + 0.45 * smoothstep(0, 0.5, t);
    col.push(v, v, v);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  frondGeo = g;
  return g;
}

let fernMat = null;
function fernMaterial() {
  if (fernMat) return fernMat;
  const m = new THREE.MeshStandardMaterial({ map: fernTexture(), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.7 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLeafGlow = globalUniforms.uLeafGlow;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLeafGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uLeafGlow * 1.5;');
  };
  m.customProgramCacheKey = () => 'fern';
  applyWind(m, { mode: 'local', height: 0.9, amp: 0.05, power: 2, flutter: 0.006 });
  fernMat = m;
  return m;
}

const FERN_TONES = [0x6f9a3a, 0x5d8a30, 0x7aa548, 0x55802c, 0x86ad4c];

// Várias touceiras numa só InstancedMesh. clumps: [{ x, y, z, s }]
export function createFerns(clumps, { seed = 9 } = {}) {
  const R = rng(seed);
  const list = [];
  for (const c of clumps) {
    const n = 7 + Math.floor(R() * 6);
    const rot0 = R() * Math.PI * 2;
    for (let i = 0; i < n; i++) list.push({ c, a: rot0 + (i / n) * Math.PI * 2 + (R() - 0.5) * 0.5, k: 0.7 + R() * 0.5 });
  }
  const mesh = new THREE.InstancedMesh(frondGeometry(), fernMaterial(), list.length);
  mesh.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  list.forEach(({ c, a, k }, i) => {
    e.set((R() - 0.5) * 0.35 - 0.1, a, (R() - 0.5) * 0.2);
    q.setFromEuler(e);
    const sc = c.s * k;
    m4.compose(p.set(c.x, c.y - 0.03, c.z), q, s.set(sc, sc * (0.85 + R() * 0.3), sc));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.setHex(FERN_TONES[Math.floor(R() * FERN_TONES.length)]).multiplyScalar(0.8 + R() * 0.35));
  });
  return mesh;
}

// Uma touceira avulsa (para o jogador plantar)
export function createFern(seed = 1, { size } = {}) {
  const R = rng(seed * 3 + 1);
  const s = size ?? 0.8 + R() * 0.5;
  const group = new THREE.Group();
  const ferns = createFerns([{ x: 0, y: 0, z: 0, s }], { seed });
  group.add(ferns);
  group.userData.radius = 0.7 * s;
  group.userData.material = 'wood';
  return group;
}

// ---------------------------------------------------------------------------
// Cogumelos: chapéu claro que brilha verde-azulado à noite (como os Mycena)
// ---------------------------------------------------------------------------
export const mushroomGlow = new THREE.MeshStandardMaterial({
  color: 0xb8a487, roughness: 0.55, emissive: 0x7cffd0, emissiveIntensity: 0, vertexColors: true,
});
export const mushroomStem = new THREE.MeshStandardMaterial({
  color: 0xd8cfb8, roughness: 0.7, emissive: 0x5adfb0, emissiveIntensity: 0,
});

let capGeo = null, stemGeo = null;
function mushroomGeometries() {
  if (capGeo) return [capGeo, stemGeo];
  const prof = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 0.5;
    prof.push(new THREE.Vector2(Math.sin(a) * 1.0, Math.cos(a) * 0.75));
  }
  prof.push(new THREE.Vector2(0.92, -0.06), new THREE.Vector2(0.2, -0.12), new THREE.Vector2(0.001, -0.1));
  capGeo = new THREE.LatheGeometry(prof, 14);
  const pa = capGeo.attributes.position;
  const col = [];
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i);
    const v = y < 0 ? 0.6 : 0.75 + y * 0.35; // lamelas embaixo mais escuras; topo mais tostado
    col.push(v, v * (y > 0.5 ? 0.88 : 0.97), v * (y > 0.5 ? 0.72 : 0.9));
  }
  capGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  stemGeo = new THREE.CylinderGeometry(0.11, 0.16, 1, 7).translate(0, 0.5, 0);
  return [capGeo, stemGeo];
}

export function createMushrooms(seed = 1) {
  const R = rng(seed * 7 + 5);
  const [cap, stem] = mushroomGeometries();
  const group = new THREE.Group();
  const n = 4 + Math.floor(R() * 5);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 0.22;
    const h = 0.05 + R() * 0.11, r = 0.022 + R() * 0.03;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const tilt = new THREE.Euler((R() - 0.5) * 0.4, R() * 6, (R() - 0.5) * 0.4);
    const st = new THREE.Mesh(stem, mushroomStem);
    st.scale.set(r * 0.9, h, r * 0.9);
    st.position.set(x, -0.01, z);
    st.rotation.copy(tilt);
    const cp = new THREE.Mesh(cap, mushroomGlow);
    cp.scale.set(r * (1.4 + R() * 0.5), r * (1.1 + R() * 0.6), r * (1.4 + R() * 0.5));
    const top = new THREE.Vector3(0, h - 0.01, 0).applyEuler(tilt);
    cp.position.set(x + top.x, top.y, z + top.z);
    cp.rotation.copy(tilt);
    st.castShadow = cp.castShadow = true;
    group.add(st, cp);
  }
  bakeGroup(group);
  group.userData.radius = 0.3;
  group.userData.material = 'wood';
  return group;
}

// ---------------------------------------------------------------------------
// Ponte de troncos: duas vigas de tronco, tábuas por cima e um corrimão.
// Construída ao longo do eixo x local, de -len/2 a +len/2, deck em y = 0.
// ---------------------------------------------------------------------------
export function createLogBridge({ length = 6, width = 1.25, seed = 4 } = {}) {
  const kit = getKit();
  const R = rng(seed);
  const group = new THREE.Group();
  const bark = mossyBarkMaterial();
  const beams = [];
  for (const z of [-width * 0.36, width * 0.36]) {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-length / 2 - 0.5, -0.2, z), new THREE.Vector3(0, -0.16, z + (R() - 0.5) * 0.1), new THREE.Vector3(length / 2 + 0.5, -0.2, z),
    ]);
    beams.push(gnarledTube(c, {
      tubular: 20, radial: 10, r0: 0.17, r1: 0.15, seed: seed + beams.length, bumps: 0.06,
      mossFn: (x, y, zz, N) => smoothstep(0.1, 0.8, N.y) * 0.7 + (1 - smoothstep(-length / 2, -length / 2 + 0.8, x)) * 0.6,
    }));
  }
  const b = new THREE.Mesh(mergeGeometries(beams), bark);
  b.castShadow = b.receiveShadow = true;
  group.add(b);
  // tábuas
  const planks = [];
  for (let x = -length / 2; x < length / 2 - 0.05; x += 0.24) {
    const g = new THREE.BoxGeometry(0.21, 0.05, width * (0.96 + R() * 0.08));
    g.rotateY((R() - 0.5) * 0.05);
    g.translate(x + 0.12, 0.0 - 0.025 + (R() - 0.5) * 0.01, (R() - 0.5) * 0.04);
    planks.push(g);
  }
  const pl = new THREE.Mesh(mergeGeometries(planks), kit.woodMat);
  pl.castShadow = pl.receiveShadow = true;
  group.add(pl);
  // corrimão de um lado: postes e um galho por cima
  const rail = [];
  const zr = width / 2 + 0.02;
  const posts = [-length / 2 + 0.3, -length / 6, length / 6, length / 2 - 0.3];
  for (const x of posts) rail.push(new THREE.CylinderGeometry(0.045, 0.055, 0.95, 6).translate(x, 0.42, zr));
  const top = new THREE.CatmullRomCurve3(posts.map((x, i) => new THREE.Vector3(x, 0.88 + (i % 2) * 0.03, zr)));
  rail.push(taperedTube(top, 24, 6, 0.045, 0.04));
  const rm = new THREE.Mesh(mergeGeometries(rail.map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; })), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
  rm.castShadow = true;
  group.add(rm);
  return { group, length, width };
}

// ---------------------------------------------------------------------------
// Barquinho de papel (o clássico de dobradura): casco em trapézio e a "vela"
// triangular no meio. Desce o riacho com a correnteza.
// ---------------------------------------------------------------------------
let paperMat = null;
export function createPaperBoat(seed = 1) {
  const kit = getKit();
  paperMat ??= new THREE.MeshStandardMaterial({ map: kit.washi, color: 0xf6f1e6, roughness: 0.85, side: THREE.DoubleSide });
  const R = rng(seed * 3 + 9);
  const L = 0.34, Lb = 0.2, H = 0.07, W = 0.075, S = 0.15;
  const v = [];
  const tri = (a, b, c) => v.push(...a, ...b, ...c);
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  // casco: borda de cima longa, fundo curto; dois lados inclinados
  for (const sz of [-1, 1]) {
    quad([-Lb / 2, 0, 0], [Lb / 2, 0, 0], [L / 2, H, sz * W], [-L / 2, H, sz * W]);
    tri([-Lb / 2, 0, 0], [-L / 2, H, sz * W], [-L / 2, H, 0]);
    tri([Lb / 2, 0, 0], [L / 2, H, sz * W], [L / 2, H, 0]);
  }
  // vela: triângulo central dobrado em dois
  for (const sz of [-1, 1]) tri([-L * 0.3, H, sz * 0.012], [L * 0.3, H, sz * 0.012], [0, H + S, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const uv = [];
  for (let i = 0; i < v.length / 3; i++) uv.push(v[i * 3] * 2 + 0.5, v[i * 3 + 1] * 2 + v[i * 3 + 2]);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, paperMat);
  m.castShadow = true;
  m.position.y = -0.02;
  const group = new THREE.Group();
  group.add(m);
  group.rotation.y = R() * Math.PI;
  group.userData.radius = 0.22;
  group.userData.material = 'water';
  group.userData.float = true;
  group.userData.drift = true;
  return group;
}
