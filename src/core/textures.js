// Texturas procedurais desenhadas em canvas na hora de carregar.
// Nada de arquivo de imagem: cor, relevo (normal map) e transparência saem de
// ruído com semente, então os materiais têm grão e variação sem pesar no download.
import * as THREE from 'three';
import { createNoise, rng, smoothstep, mix } from './noise.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Preenche um canvas pixel a pixel. fn(x, y, out) escreve [r, g, b, a] em `out`.
function paint(w, h, fn) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const out = [0, 0, 0, 255];
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      out[3] = 255;
      fn(x, y, out);
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Converte um campo de alturas (0..1) num normal map (convenção OpenGL do three).
export function normalCanvasFromHeight(height, w, h, strength = 2, wrap = true) {
  return paint(w, h, (x, y, out) => {
    const xl = wrap ? (x - 1 + w) % w : Math.max(x - 1, 0);
    const xr = wrap ? (x + 1) % w : Math.min(x + 1, w - 1);
    const yu = wrap ? (y - 1 + h) % h : Math.max(y - 1, 0);
    const yd = wrap ? (y + 1) % h : Math.min(y + 1, h - 1);
    const dx = (height[y * w + xr] - height[y * w + xl]) * strength;
    const dy = (height[yd * w + x] - height[yu * w + x]) * strength;
    const nx = -dx, ny = dy, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    out[0] = (nx / l * 0.5 + 0.5) * 255;
    out[1] = (ny / l * 0.5 + 0.5) * 255;
    out[2] = (nz / l * 0.5 + 0.5) * 255;
  });
}

export function toTexture(canvas, { srgb = false, repeat = [1, 1], wrap = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mixRGB = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

// --- chão de musgo e terra ----------------------------------------------------
export function groundTextures(size = 512) {
  const nz = createNoise(11);
  const R = rng(5);
  const P = 6;
  const heights = new Float32Array(size * size);
  const soil = hex(0x54452f), mossD = hex(0x33501f), mossL = hex(0x5c7c30), dry = hex(0x7d8243), deep = hex(0x24391a);
  const color = paint(size, size, (x, y, out) => {
    const u = (x / size) * P, v = (y / size) * P;
    const n1 = nz.fbm2(u, v, 5, P, P);
    const n2 = nz.fbm2(u * 4 + 3, v * 4 + 7, 3, P * 4, P * 4);
    // almofadinhas de musgo: bolhas pequenas e claras no topo, escuras nas frestas
    const cell = nz.n2(u * 16 + 1, v * 16 + 5, P * 16, P * 16);
    const bump = Math.abs(cell);
    const t = smoothstep(-0.5, -0.22, n1 + n2 * 0.35); // musgo domina; terra só nas falhas
    let c = mixRGB(mossD, mossL, smoothstep(-0.35, 0.45, n2 * 0.7 + n1 * 0.5));
    c = mixRGB(c, dry, smoothstep(0.3, 0.6, n1) * 0.25);
    c = mixRGB(c, deep, (1 - smoothstep(0.0, 0.25, bump)) * 0.45);
    c = mixRGB(soil, c, t);
    const s = 0.9 + R() * 0.2;
    out[0] = c[0] * s; out[1] = c[1] * s; out[2] = c[2] * s;
    heights[y * size + x] = t * 0.5 + smoothstep(0.0, 0.3, bump) * 0.35 + n2 * 0.15 + R() * 0.08;
  });
  return {
    map: toTexture(color, { srgb: true }),
    normalMap: toTexture(normalCanvasFromHeight(heights, size, size, 3)),
    heights,
  };
}

// --- detalhe de pedra (granito), cinza; usado em projeção triplanar ------------
export function stoneDetailTexture(size = 512) {
  const nz = createNoise(23);
  const R = rng(9);
  const P = 4;
  const c = paint(size, size, (x, y, out) => {
    const u = (x / size) * P, v = (y / size) * P;
    const base = nz.fbm2(u, v, 5, P, P);
    const vein = 1 - smoothstep(0.0, 0.05, Math.abs(nz.fbm2(u * 0.7 + 9, v * 0.7, 4, P * 0.7, P * 0.7)));
    let g = 0.55 + base * 0.45 - vein * 0.12;
    const r = R();
    if (r < 0.05) g -= 0.18;
    else if (r > 0.97) g += 0.15;
    g += (R() - 0.5) * 0.08;
    const val = Math.max(0, Math.min(1, g)) * 255;
    out[0] = out[1] = out[2] = val;
  });
  return toTexture(c);
}

// --- areia: cor base com grão fino -------------------------------------------
export function sandTexture(size = 512) {
  const nz = createNoise(31);
  const R = rng(13);
  const P = 8;
  const base = hex(0xdcd2bc), warm = hex(0xcdbf9f);
  const c = paint(size, size, (x, y, out) => {
    const u = (x / size) * P, v = (y / size) * P;
    const n = nz.fbm2(u, v, 4, P, P);
    const col = mixRGB(base, warm, smoothstep(-0.3, 0.4, n) * 0.6);
    const g = 0.9 + R() * 0.16 + (R() > 0.985 ? -0.25 : 0);
    out[0] = col[0] * g; out[1] = col[1] * g; out[2] = col[2] * g;
  });
  return toTexture(c, { srgb: true });
}

// --- tábuas de madeira (deck) --------------------------------------------------
export function woodTextures(size = 512) {
  const nz = createNoise(41);
  const R = rng(17);
  const planks = 4;
  const light = hex(0x8c6748), mid = hex(0x6a4a33), dark = hex(0x41291b);
  const heights = new Float32Array(size * size);
  const tones = Array.from({ length: planks }, () => 0.82 + R() * 0.3);
  const color = paint(size, size, (x, y, out) => {
    const u = x / size, v = y / size;
    const row = Math.floor(v * planks);
    const local = v * planks - row;
    const grain = nz.fbm2(u * 3, v * 60 + row * 13, 4, 3, 60);
    const ring = Math.sin((v * planks * 18 + grain * 4 + nz.fbm2(u * 2, row * 3, 2, 2, 1 << 20) * 6) * Math.PI);
    let c = mixRGB(mid, light, smoothstep(-0.6, 0.8, ring) * 0.7 + grain * 0.3);
    c = mixRGB(c, dark, smoothstep(0.6, 1.0, ring) * 0.35);
    const gap = smoothstep(0.0, 0.025, local) * smoothstep(1.0, 0.975, local);
    const t = tones[row] * (0.55 + 0.45 * gap);
    out[0] = c[0] * t; out[1] = c[1] * t; out[2] = c[2] * t;
    heights[y * size + x] = gap * (0.8 + grain * 0.15) + ring * 0.03;
  });
  return {
    map: toTexture(color, { srgb: true }),
    normalMap: toTexture(normalCanvasFromHeight(heights, size, size, 4)),
  };
}

// --- casca de árvore: fissuras ao longo do comprimento (eixo u do tubo) ---------
export function barkTextures(w = 512, h = 256) {
  const nz = createNoise(53);
  const R = rng(19);
  const heights = new Float32Array(w * h);
  const a = hex(0x4b3e33), b = hex(0x7a6a5a), moss = hex(0x56693a);
  const color = paint(w, h, (x, y, out) => {
    const u = (x / w) * 2, v = (y / h) * 8;
    const f = nz.fbm2(u, v, 5, 2, 8);
    const fissure = smoothstep(0.05, -0.25, f);
    const m = smoothstep(0.25, 0.5, nz.fbm2(u * 0.5 + 4, v * 0.5, 3, 1, 4));
    let c = mixRGB(b, a, fissure);
    c = mixRGB(c, moss, m * 0.5);
    const s = 0.88 + R() * 0.2;
    out[0] = c[0] * s; out[1] = c[1] * s; out[2] = c[2] * s;
    heights[y * w + x] = 1 - fissure + R() * 0.05;
  });
  return {
    map: toTexture(color, { srgb: true }),
    normalMap: toTexture(normalCanvasFromHeight(heights, w, h, 4)),
  };
}

// --- folha de bordo japonês (branca, tingida pela cor de cada instância) -------
export function mapleLeafTexture(size = 256) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size * 0.58;
  ctx.translate(cx, cy);
  ctx.beginPath();
  const lobes = 7; // 5 grandes + 2 pequenos junto ao talo
  const pts = [];
  for (let i = 0; i <= 720; i++) {
    const th = (i / 720) * Math.PI * 2;
    const a = th - Math.PI / 2; // ponta principal para cima
    const lobe = Math.pow(Math.abs(Math.cos((th * lobes) / 2)), 1.6);
    const down = 1 - 0.55 * smoothstep(0.6, 0.95, -Math.cos(th)); // lóbulos de baixo menores
    const serr = 1 + 0.035 * Math.sin(th * 70);
    const r = (0.1 + 0.4 * lobe * down) * serr * size;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, size * 0.5);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#d8d8d8');
  ctx.fillStyle = grad;
  ctx.fill();
  // nervuras
  ctx.strokeStyle = 'rgba(150,150,150,0.55)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * ((Math.PI * 2) / 7);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * size * 0.42, Math.sin(a) * size * 0.42);
    ctx.stroke();
  }
  // talo
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, size * 0.38); ctx.stroke();
  const t = toTexture(c, { srgb: true, wrap: false });
  return t;
}

// --- folha de bambu: lança com talo em cima (v=1) e ponta fina embaixo ---------
export function bambooLeafTexture(w = 64, h = 512) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const half = (t) => {
    // meia-largura ao longo do comprimento: estreita no talo, larga a ~30%, ponta longa
    if (t < 0.06) return 0.08 + t * 3;
    return Math.pow(Math.sin(Math.min(1, (t - 0.02) / 0.98) * Math.PI), 0.75) * (1 - t * 0.35) * 0.46;
  };
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) { const t = i / 100; ctx.lineTo(w / 2 + half(t) * w, 2 + t * (h - 4)); }
  for (let i = 100; i >= 0; i--) { const t = i / 100; ctx.lineTo(w / 2 - half(t) * w, 2 + t * (h - 4)); }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#c4c4c4'); g.addColorStop(0.45, '#ffffff'); g.addColorStop(0.55, '#f2f2f2'); g.addColorStop(1, '#bcbcbc');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // nervuras paralelas e borda levemente amarelada
  ctx.strokeStyle = 'rgba(150,150,150,0.35)';
  ctx.lineWidth = 1;
  for (const k of [-0.3, -0.18, 0.18, 0.3]) {
    ctx.beginPath();
    for (let i = 4; i <= 96; i++) { const t = i / 100; ctx.lineTo(w / 2 + half(t) * w * k * 2, 2 + t * (h - 4)); }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(225,215,150,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) { const t = i / 100; ctx.lineTo(w / 2 + half(t) * w, 2 + t * (h - 4)); }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(205,205,170,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w / 2, 2); ctx.lineTo(w / 2, h * 0.92); ctx.stroke();
  return toTexture(c, { srgb: true, wrap: false });
}

// --- colmo de bambu: listras, faixa de pó branco abaixo de cada nó, manchas ----
// `nodes`: alturas normalizadas (0..1) dos nós, as mesmas da geometria.
export function bambooCulmTexture(nodes, { w = 64, h = 1024, seed = 7 } = {}) {
  const nz = createNoise(seed);
  const R = rng(seed);
  const green = hex(0x5d7f2c), dark = hex(0x3f5d1f), yellow = hex(0x9fa34a), powder = hex(0xc8d0b0), scar = hex(0x7d7550);
  const c = paint(w, h, (x, y, out) => {
    const u = x / w, v = 1 - y / h;
    const streak = nz.fbm2(u * 24, v * 2, 3, 24, 1 << 20);
    let col = mixRGB(dark, green, 0.55 + streak * 0.6);
    // envelhecimento: manchas amareladas e líquen na parte baixa
    const age = smoothstep(0.15, 0.5, nz.fbm2(u * 4 + 2, v * 18, 4, 4, 1 << 20));
    col = mixRGB(col, yellow, age * 0.35);
    const lichen = smoothstep(0.35, 0.55, nz.fbm2(u * 10 + 9, v * 60, 3, 10, 1 << 20)) * (1 - smoothstep(0.05, 0.35, v));
    col = mixRGB(col, [150, 150, 130], lichen * 0.6);
    for (const n of nodes) {
      const d = v - n;                                   // >0 acima do nó
      if (Math.abs(d) < 0.004) col = mixRGB(col, scar, 0.8);            // anel da bainha
      else if (d < 0 && d > -0.03) col = mixRGB(col, powder, 0.55 * (1 + d / 0.03)); // pó branco
      else if (d > 0 && d < 0.012) col = mixRGB(col, dark, 0.35);       // sombra logo acima
    }
    const s = 0.94 + R() * 0.1;
    out[0] = col[0] * s; out[1] = col[1] * s; out[2] = col[2] * s;
  });
  const t = toTexture(c, { srgb: true });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// --- folhinha elíptica (azaleia, buxinho), branca para tingir por instância ----
export function smallLeafTexture(size = 128) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.translate(size / 2, size / 2);
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.22, size * 0.46, 0, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(-size * 0.22, 0, size * 0.22, 0);
  g.addColorStop(0, '#bdbdbd'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#c4c4c4');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,140,140,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -size * 0.42); ctx.lineTo(0, size * 0.46); ctx.stroke();
  return toTexture(c, { srgb: true, wrap: false });
}

// --- água: normal map ondulado que repete -------------------------------------
export function waterNormalTexture(size = 256) {
  const nz = createNoise(61);
  const P = 4;
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * P, v = (y / size) * P;
      heights[y * size + x] = nz.fbm2(u, v, 5, P, P) * 0.5 + Math.abs(nz.fbm2(u * 2 + 5, v * 2, 3, P * 2, P * 2)) * 0.3;
    }
  }
  return toTexture(normalCanvasFromHeight(heights, size, size, 6));
}

// --- névoa/fumaça: mancha macia com bordas irregulares ------------------------
export function softBlobTexture(size = 256, seed = 71) {
  const nz = createNoise(seed);
  const c = paint(size, size, (x, y, out) => {
    const u = x / size - 0.5, v = y / size - 0.5;
    const r = Math.hypot(u, v) * 2;
    const n = nz.fbm2(u * 4 + 10, v * 4 + 10, 4);
    const a = smoothstep(1, 0.15, r + n * 0.45) * (0.75 + n * 0.5);
    out[0] = out[1] = out[2] = 255;
    out[3] = Math.max(0, Math.min(1, a)) * 255;
  });
  return toTexture(c, { srgb: true, wrap: false });
}

// --- raminho de salgueiro: haste fina com folhas estreitas e pontudas,
// alternadas, inclinadas para baixo, com folga entre elas (o céu aparece)
export function willowStrandTexture(w = 64, h = 512, seed = 3) {
  const R = rng(seed);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const cx = (y) => w / 2 + Math.sin(y / h * 7) * 2.5;
  ctx.strokeStyle = 'rgba(175,170,140,0.95)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let y = 0; y <= h; y += 4) ctx.lineTo(cx(y), y);
  ctx.stroke();
  let side = 1;
  for (let y = 4; y < h - 6; y += 4 + R() * 4) {
    side = -side;
    const len = (17 + R() * 13) * (1 - (y / h) * 0.3);
    const wid = 2.0 + R() * 1.2;
    const ang = side * (0.32 + R() * 0.38); // apontando para baixo e para fora
    ctx.save();
    ctx.translate(cx(y), y);
    ctx.rotate(ang);
    // folha em lança: base estreita, mais larga no primeiro terço, ponta fina
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(wid * 1.6, len * 0.3, 0, len);
    ctx.quadraticCurveTo(-wid * 1.6, len * 0.3, 0, 0);
    const g = ctx.createLinearGradient(-wid, 0, wid, 0);
    const v = 205 + R() * 50;
    g.addColorStop(0, `rgb(${v * 0.86},${v * 0.86},${v * 0.86})`);
    g.addColorStop(0.5, `rgb(${v},${v},${v})`);
    g.addColorStop(1, `rgb(${v * 0.8},${v * 0.8},${v * 0.8})`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }
  return toTexture(c, { srgb: true, wrap: false });
}

// --- asa de libélula: membrana translúcida, nervuras e a manchinha na ponta
export function dragonflyWingTexture(w = 256, h = 64) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.moveTo(2, h * 0.5);
  ctx.bezierCurveTo(w * 0.3, h * 0.05, w * 0.85, h * 0.08, w - 3, h * 0.35);
  ctx.bezierCurveTo(w - 1, h * 0.6, w * 0.8, h * 0.9, w * 0.4, h * 0.8);
  ctx.bezierCurveTo(w * 0.2, h * 0.75, w * 0.05, h * 0.65, 2, h * 0.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(235,245,255,0.28)';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(40,45,50,0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(2, h * 0.5);
    ctx.quadraticCurveTo(w * 0.5, h * (0.2 + i * 0.13), w, h * (0.25 + i * 0.12));
    ctx.stroke();
  }
  for (let x = 12; x < w; x += 9) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 3, h); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(30,30,30,0.85)';
  ctx.fillRect(w * 0.86, h * 0.22, 10, 5);
  return toTexture(c, { srgb: true, wrap: false });
}

// --- papel washi: fibras claras, para as lanternas de papel
export function washiTexture(size = 256) {
  const nz = createNoise(91);
  const R = rng(29);
  const c = paint(size, size, (x, y, out) => {
    const u = x / size * 4, v = y / size * 4;
    const fib = Math.abs(nz.fbm2(u * 6, v * 1.5, 3, 24, 6));
    const g = 235 - fib * 50 + (R() - 0.5) * 10;
    out[0] = g; out[1] = g * 0.97; out[2] = g * 0.9;
  });
  return toTexture(c, { srgb: true });
}

// --- cerejeira (sakura) ----------------------------------------------------------
// Uma flor de cinco pétalas, cada pétala com o entalhe na ponta que é a marca da
// sakura; rosa mais funda no centro, quase branca na borda, estames finos.
function drawBlossom(ctx, x, y, r, rot, R, { open = 1 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const w = r * 0.62 * open;
  for (let k = 0; k < 5; k++) {
    ctx.save();
    ctx.rotate((k / 5) * Math.PI * 2 + (R() - 0.5) * 0.18);
    const L = r * (0.92 + R() * 0.12);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-w * 0.9, -L * 0.25, -w * 1.05, -L * 0.75, -w * 0.42, -L);
    ctx.quadraticCurveTo(-w * 0.12, -L * 0.98, 0, -L * 0.84); // entalhe
    ctx.quadraticCurveTo(w * 0.12, -L * 0.98, w * 0.42, -L);
    ctx.bezierCurveTo(w * 1.05, -L * 0.75, w * 0.9, -L * 0.25, 0, 0);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L);
    g.addColorStop(0, '#e98aa4');
    g.addColorStop(0.28, '#f7c3d0');
    g.addColorStop(0.7, '#fde8ee');
    g.addColorStop(1, '#fff7f9');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(214,140,160,0.45)';
    ctx.lineWidth = Math.max(0.6, r * 0.035);
    ctx.stroke();
    // nervurinhas
    ctx.strokeStyle = 'rgba(230,160,180,0.35)';
    ctx.lineWidth = Math.max(0.4, r * 0.02);
    for (const a of [-0.25, 0, 0.25]) {
      ctx.beginPath(); ctx.moveTo(0, -L * 0.15); ctx.lineTo(a * w, -L * 0.75); ctx.stroke();
    }
    ctx.restore();
  }
  // olho do centro e estames
  ctx.fillStyle = 'rgba(176,52,86,0.85)';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2); ctx.fill();
  const n = 10 + Math.floor(R() * 5);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + R() * 0.3, l = r * (0.3 + R() * 0.14);
    ctx.strokeStyle = 'rgba(236,214,220,0.9)';
    ctx.lineWidth = Math.max(0.5, r * 0.025);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l); ctx.stroke();
    ctx.fillStyle = '#d9a64a';
    ctx.beginPath(); ctx.arc(Math.cos(a) * l, Math.sin(a) * l, Math.max(0.8, r * 0.045), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawBud(ctx, x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.55, r, 0, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#f6b4c6'); g.addColorStop(1, '#d4607f');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

// Ramalhete: um galhinho coberto de umbelas — muitas flores pequenas, de
// frente, de lado e de costas, com botões; visto de longe vira "nuvem" rosada.
export function sakuraBlossomTexture(size = 256, seed = 17) {
  const R = rng(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const s = size / 256;
  const flowers = [];
  for (let i = 0; i < 17; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R());
    flowers.push([128 * s + Math.cos(a) * d * 96 * s, 128 * s + Math.sin(a) * d * 90 * s, (19 + R() * 8) * s]);
  }
  // raminho e pedúnculos por baixo das flores
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#4a2c2c';
  ctx.lineWidth = 4 * s;
  ctx.beginPath(); ctx.moveTo(20 * s, 210 * s); ctx.quadraticCurveTo(120 * s, 150 * s, 236 * s, 70 * s); ctx.stroke();
  ctx.strokeStyle = '#8a4a4a';
  ctx.lineWidth = 1.6 * s;
  for (const [x, y] of flowers) {
    const bx = x * 0.6 + 128 * s * 0.4, by = y * 0.6 + 140 * s * 0.4;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x, y); ctx.stroke();
  }
  for (let i = 0; i < 6; i++) drawBud(ctx, (30 + R() * 196) * s, (30 + R() * 196) * s, (6 + R() * 3) * s, R() * 6);
  flowers.sort((a, b) => a[1] - b[1]).forEach(([x, y, r]) => drawBlossom(ctx, x, y, r, R() * 6, R, { open: 0.85 + R() * 0.2 }));
  return toTexture(c, { srgb: true, wrap: false });
}

// Uma pétala solta (para as que caem e boiam): branca, tingida por instância.
export function sakuraPetalTexture(size = 64) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const L = size * 0.46, w = size * 0.3;
  ctx.translate(size / 2, size * 0.96);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-w * 0.9, -L * 0.3, -w * 1.1, -L * 1.4, -w * 0.45, -L * 1.9);
  ctx.quadraticCurveTo(-w * 0.1, -L * 1.92, 0, -L * 1.72);
  ctx.quadraticCurveTo(w * 0.1, -L * 1.92, w * 0.45, -L * 1.9);
  ctx.bezierCurveTo(w * 1.1, -L * 1.4, w * 0.9, -L * 0.3, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, -L * 1.9);
  g.addColorStop(0, '#e9b3c0'); g.addColorStop(0.35, '#fbe6ec'); g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.fill();
  return toTexture(c, { srgb: true, wrap: false });
}

// Raminho pendente da cerejeira-chorona: haste fina com flores e botões
// alternados (repete em v; a ponta do ramo usa a parte de baixo).
export function sakuraStrandTexture(w = 64, h = 512, seed = 5) {
  const R = rng(seed);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const cx = (y) => w / 2 + Math.sin((y / h) * Math.PI * 6) * 3;
  ctx.strokeStyle = '#5a3634';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let y = 0; y <= h; y += 4) (y ? ctx.lineTo(cx(y), y) : ctx.moveTo(cx(y), y));
  ctx.stroke();
  let side = 1;
  for (let y = 10; y < h - 8; y += 20 + R() * 12) {
    const x = cx(y) + side * (6 + R() * 7);
    ctx.strokeStyle = '#7a4444';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx(y - 6), y - 6); ctx.lineTo(x, y); ctx.stroke();
    if (R() < 0.12) drawBud(ctx, x, y, 6, side * 0.5);
    else drawBlossom(ctx, x, y, 11 + R() * 5, R() * 6, R);
    side = -side;
  }
  const t = toTexture(c, { srgb: true, wrap: false });
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Casca da cerejeira: cinza-arroxeada, lisa e meio brilhante, com as lenticelas
// (traços claros que dão a volta no tronco) e fissuras escuras nos troncos velhos.
// No tubo, x da textura corre ao longo do galho e y dá a volta.
export function sakuraBarkTextures(w = 512, h = 256) {
  const nz = createNoise(83);
  const R = rng(37);
  const heights = new Float32Array(w * h);
  const a = hex(0x2e2224), b = hex(0x574546), lichen = hex(0x6d7258);
  const color = paint(w, h, (x, y, out) => {
    const u = (x / w) * 2, v = (y / h) * 4;
    const f = nz.fbm2(u * 1.5, v, 5, 3, 4);
    const crack = smoothstep(-0.12, -0.32, nz.fbm2(u * 0.8 + 3, v * 2.5, 4, 1.6, 10));
    let c = mixRGB(b, a, smoothstep(-0.4, 0.4, f));
    c = mixRGB(c, lichen, smoothstep(0.32, 0.55, nz.fbm2(u * 0.6 + 7, v * 0.6, 3, 1.2, 2.4)) * 0.45);
    c = mixRGB(c, [20, 14, 15], crack * 0.8);
    const s = 0.9 + R() * 0.14;
    out[0] = c[0] * s; out[1] = c[1] * s; out[2] = c[2] * s;
    heights[y * w + x] = 0.6 + f * 0.15 - crack * 0.5 + R() * 0.03;
  });
  // lenticelas: traços estreitos ao longo do galho, compridos em volta dele
  const ctx = color.getContext('2d');
  for (let i = 0; i < 520; i++) {
    const x = R() * w, y = R() * h, len = 6 + R() * 22, th = 1.2 + R() * 1.6;
    const g = 150 + R() * 50;
    ctx.fillStyle = `rgba(${g},${g * 0.88},${g * 0.8},${0.35 + R() * 0.35})`;
    ctx.beginPath(); ctx.ellipse(x, y, th, len, 0, 0, Math.PI * 2); ctx.fill();
    for (let yy = Math.floor(y - len); yy < y + len; yy++) {
      for (let xx = Math.floor(x - th); xx < x + th; xx++) {
        const k = ((yy % h) + h) % h * w + ((xx % w) + w) % w;
        heights[k] += 0.08;
      }
    }
  }
  return {
    map: toTexture(color, { srgb: true }),
    normalMap: toTexture(normalCanvasFromHeight(heights, w, h, 3)),
  };
}
