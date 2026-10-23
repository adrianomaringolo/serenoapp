// Ruído determinístico (Perlin 2D/3D + fbm) e gerador aleatório com semente.
// Tudo que é "orgânico" no jogo — pedras, texturas, relevo — sai daqui, e a
// semente garante que a mesma pedra salva volta igual ao recarregar.

export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const G2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const G3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1],
  [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
const BIG = 1 << 20;

export function createNoise(seed = 1) {
  const r = rng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  // px/py: período (em células) para texturas que repetem sem emenda.
  function n2(x, y, px = BIG, py = BIG) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const g = (ix, iy, dx, dy) => {
      const q = G2[perm[(perm[ix & 255] + iy) & 255] & 7];
      return q[0] * dx + q[1] * dy;
    };
    const u = fade(xf), v = fade(yf);
    return lerp(
      lerp(g(x0, y0, xf, yf), g(x1, y0, xf - 1, yf), u),
      lerp(g(x0, y1, xf, yf - 1), g(x1, y1, xf - 1, yf - 1), u),
      v,
    );
  }

  function n3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const X = xi & 255, Y = yi & 255, Z = zi & 255;
    const g = (ix, iy, iz, dx, dy, dz) => {
      const q = G3[perm[perm[perm[ix & 255] + (iy & 255)] + (iz & 255)] % 12];
      return q[0] * dx + q[1] * dy + q[2] * dz;
    };
    const u = fade(xf), v = fade(yf), w = fade(zf);
    return lerp(
      lerp(
        lerp(g(X, Y, Z, xf, yf, zf), g(X + 1, Y, Z, xf - 1, yf, zf), u),
        lerp(g(X, Y + 1, Z, xf, yf - 1, zf), g(X + 1, Y + 1, Z, xf - 1, yf - 1, zf), u),
        v,
      ),
      lerp(
        lerp(g(X, Y, Z + 1, xf, yf, zf - 1), g(X + 1, Y, Z + 1, xf - 1, yf, zf - 1), u),
        lerp(g(X, Y + 1, Z + 1, xf, yf - 1, zf - 1), g(X + 1, Y + 1, Z + 1, xf - 1, yf - 1, zf - 1), u),
        v,
      ),
      w,
    );
  }

  function fbm2(x, y, oct = 4, px = BIG, py = BIG) {
    let s = 0, a = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += a * n2(x * f, y * f, px * f, py * f);
      norm += a; a *= 0.5; f *= 2;
    }
    return s / norm;
  }

  function fbm3(x, y, z, oct = 4) {
    let s = 0, a = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += a * n3(x * f, y * f, z * f);
      norm += a; a *= 0.5; f *= 2;
    }
    return s / norm;
  }

  return { n2, n3, fbm2, fbm3 };
}

export const smoothstep = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};
export const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
export const mix = lerp;
