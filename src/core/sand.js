// Areia rastelável. Um canvas guarda a altura da areia (sulcos e cristas); dele
// saem o relevo da malha (displacement), a sombra dos sulcos (aoMap) e o
// normal map, que é recalculado só no pedaço que o rastelo acabou de mexer.
import * as THREE from 'three';

const RIDGE = 150;   // areia empurrada pelas bordas do rastelo
const FLAT = 128;    // areia lisa
const PROFILE = [    // perfil de um dente: [largura relativa, altura]
  [0.85, 118],
  [0.6, 92],
  [0.3, 70],
];

export function createSand({ renderer = null, width, depth, sandMap, res = 1024, tines = 5, spacing = 0.13, segments = [240, 150] }) {
  const W = res, H = Math.round(res * (depth / width));
  const ppm = W / width; // pixels por metro
  const height = document.createElement('canvas');
  height.width = W; height.height = H;
  const hctx = height.getContext('2d');
  hctx.fillStyle = `rgb(${FLAT},${FLAT},${FLAT})`;
  hctx.fillRect(0, 0, W, H);
  const normal = document.createElement('canvas');
  normal.width = W; normal.height = H;
  const nctx = normal.getContext('2d');

  const heightTex = new THREE.CanvasTexture(height);
  heightTex.colorSpace = THREE.NoColorSpace;
  const normalTex = new THREE.CanvasTexture(normal);
  normalTex.colorSpace = THREE.NoColorSpace;
  heightTex.anisotropy = normalTex.anisotropy = 8;

  const map = sandMap.clone();
  map.repeat.set(width / 2.5, depth / 2.5);
  map.needsUpdate = true;

  const geo = new THREE.PlaneGeometry(width, depth, segments[0], segments[1]);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    map,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(1, 1),
    displacementMap: heightTex,
    displacementScale: 0.05,
    displacementBias: -0.025,
    aoMap: heightTex,
    aoMapIntensity: 0.65,
    roughness: 0.96,
    color: 0xf2ece0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  const sp = spacing * ppm;          // espaço entre dentes, em pixels
  const swath = sp * tines;

  // --- normal map (região suja) ---------------------------------------------
  let dirty = null;
  const markDirty = (x0, y0, x1, y1) => {
    if (!dirty) dirty = [x0, y0, x1, y1];
    else {
      dirty[0] = Math.min(dirty[0], x0); dirty[1] = Math.min(dirty[1], y0);
      dirty[2] = Math.max(dirty[2], x1); dirty[3] = Math.max(dirty[3], y1);
    }
  };
  function rebuildNormals(rect) {
    let [x0, y0, x1, y1] = rect || [0, 0, W, H];
    x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2);
    x1 = Math.min(W, Math.ceil(x1) + 2); y1 = Math.min(H, Math.ceil(y1) + 2);
    const w = x1 - x0, h = y1 - y0;
    if (w <= 2 || h <= 2) return;
    // lê 1 px a mais em volta: a borda do retângulo precisa dos vizinhos de
    // verdade, senão vira uma emenda no relevo
    const sx0 = Math.max(0, x0 - 1), sy0 = Math.max(0, y0 - 1);
    const sw = Math.min(W, x1 + 1) - sx0, sh = Math.min(H, y1 + 1) - sy0;
    const src = hctx.getImageData(sx0, sy0, sw, sh).data;
    const at = (x, y) => src[((Math.min(Math.max(y - sy0, 0), sh - 1)) * sw + Math.min(Math.max(x - sx0, 0), sw - 1)) * 4];
    const out = nctx.createImageData(w, h);
    const d = out.data;
    const k = 2.4 / 255;
    for (let y = 0; y < h; y++) {
      const gy = y0 + y;
      for (let x = 0; x < w; x++) {
        const gx = x0 + x;
        const dx = (at(gx + 1, gy) - at(gx - 1, gy)) * k;
        const dy = (at(gx, gy + 1) - at(gx, gy - 1)) * k;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * w + x) * 4;
        d[i] = (-dx / l * 0.5 + 0.5) * 255;
        d[i + 1] = (dy / l * 0.5 + 0.5) * 255;
        d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    nctx.putImageData(out, x0, y0);
    if (rect) {
      uploadRect(normalTex, out, x0, y0);
      uploadRect(heightTex, hctx.getImageData(x0, y0, w, h), x0, y0);
    } else {
      normalTex.needsUpdate = true;
      heightTex.needsUpdate = true;
    }
  }

  // Envia à GPU só o retângulo que mudou. Reenviar as duas texturas inteiras
  // (1024 px) a cada traço era o engasgo de quem rastela.
  function uploadRect(tex, image, x, y) {
    const props = renderer && renderer.properties.get(tex);
    if (!props || !props.__webglTexture || props.__version !== tex.version) {
      tex.needsUpdate = true; // ainda não subiu inteira: deixa o three cuidar
      return;
    }
    const gl = renderer.getContext();
    renderer.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // mesma orientação do upload do three
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, H - y - image.height, image.width, image.height, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  // --- traço do rastelo -------------------------------------------------------
  // Cada trecho apaga a faixa por onde o rastelo passa e desenha os sulcos dos
  // dentes. Os sulcos do trecho anterior são redesenhados junto, passada por
  // passada: assim a ponta arredondada de um trecho não deixa uma "emenda"
  // clara atravessando o sulco do outro.
  function tineLines(segs, width, value) {
    hctx.strokeStyle = `rgb(${value},${value},${value})`;
    hctx.lineWidth = width;
    hctx.beginPath();
    for (const [ax, ay, bx, by, nx, ny] of segs) {
      for (let k = 0; k < tines; k++) {
        const off = (k - (tines - 1) / 2) * sp;
        hctx.moveTo(ax + nx * off, ay + ny * off);
        hctx.lineTo(bx + nx * off, by + ny * off);
      }
    }
    hctx.stroke();
  }

  function strokeSegment(state, ax, ay, bx, by, nx, ny) {
    const seg = [ax, ay, bx, by, nx, ny];
    hctx.lineCap = 'butt';
    hctx.strokeStyle = `rgb(${RIDGE},${RIDGE},${RIDGE})`;
    hctx.lineWidth = swath + sp * 0.3;
    hctx.beginPath(); hctx.moveTo(ax, ay); hctx.lineTo(bx, by); hctx.stroke();
    hctx.lineCap = 'round';
    state.recent = state.recent || [];
    state.recent.push(seg);
    if (state.recent.length > 5) state.recent.shift();
    for (const [wr, v] of PROFILE) tineLines(state.recent, sp * wr, v);
    const pad = swath;
    markDirty(Math.min(ax, bx) - pad, Math.min(ay, by) - pad, Math.max(ax, bx) + pad, Math.max(ay, by) + pad);
  }

  // Desenha uma polilinha (em pixels) suavizando a direção nas curvas.
  function strokePath(pts) {
    const state = {};
    let dx = 0, dy = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      let ddx = bx - ax, ddy = by - ay;
      const l = Math.hypot(ddx, ddy) || 1;
      ddx /= l; ddy /= l;
      dx = i === 1 ? ddx : dx * 0.5 + ddx * 0.5;
      dy = i === 1 ? ddy : dy * 0.5 + ddy * 0.5;
      const dl = Math.hypot(dx, dy) || 1;
      strokeSegment(state, ax, ay, bx, by, -dy / dl, dx / dl);
    }
  }

  // uv (0..1 da malha) → pixel; v cresce para cima, o canvas para baixo
  const toPx = (uv) => [uv.x * W, (1 - uv.y) * H];

  let stroke = null;
  function rakeStart(uv) {
    const p = toPx(uv);
    stroke = { last: p, dir: null, speed: 0 };
  }
  function rakeMove(uv) {
    if (!stroke) return 0;
    const p = toPx(uv);
    const [lx, ly] = stroke.last;
    let dx = p[0] - lx, dy = p[1] - ly;
    const l = Math.hypot(dx, dy);
    if (l < 3) return 0;
    dx /= l; dy /= l;
    if (stroke.dir) {
      dx = stroke.dir[0] * 0.55 + dx * 0.45;
      dy = stroke.dir[1] * 0.55 + dy * 0.45;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
    }
    stroke.dir = [dx, dy];
    strokeSegment(stroke, lx, ly, p[0], p[1], -dy, dx);
    stroke.last = p;
    return l / ppm;
  }
  function rakeEnd() {
    stroke = null;
    flush();
  }

  let lastFlush = 0;
  function update() {
    const now = performance.now();
    if (dirty && now - lastFlush > 70) flush();
  }
  function flush() {
    if (!dirty) return;
    rebuildNormals(dirty);
    dirty = null;
    lastFlush = performance.now();
  }

  // --- padrões iniciais --------------------------------------------------------
  // centros: [{x, z, r}] em coordenadas locais da areia (metros, centro = 0,0)
  function drawClassic(centers = []) {
    hctx.fillStyle = `rgb(${FLAT},${FLAT},${FLAT})`;
    hctx.fillRect(0, 0, W, H);
    // linhas retas ao longo do comprimento
    for (let y = swath / 2; y < H + swath; y += swath + sp * 0.15) {
      strokePath([[-20, y], [W + 20, y]]);
    }
    // anéis concêntricos ao redor das pedras
    for (const c of centers) {
      const cx = (c.x / width + 0.5) * W;
      const cy = (c.z / depth + 0.5) * H;
      const r0 = c.r * ppm + swath * 0.5;
      hctx.fillStyle = `rgb(${FLAT},${FLAT},${FLAT})`;
      hctx.beginPath(); hctx.arc(cx, cy, r0 + swath * 2.6, 0, Math.PI * 2); hctx.fill();
      // anéis como círculos contínuos: sem emendas
      for (let ring = 0; ring < 3; ring++) {
        const r = r0 + ring * (swath + sp * 0.15);
        hctx.strokeStyle = `rgb(${RIDGE},${RIDGE},${RIDGE})`;
        hctx.lineWidth = swath + sp * 0.3;
        hctx.beginPath(); hctx.arc(cx, cy, r, 0, Math.PI * 2); hctx.stroke();
        for (const [wr, v] of PROFILE) {
          hctx.strokeStyle = `rgb(${v},${v},${v})`;
          hctx.lineWidth = sp * wr;
          hctx.beginPath();
          for (let k = 0; k < tines; k++) {
            const rr = r + (k - (tines - 1) / 2) * sp;
            hctx.moveTo(cx + rr, cy);
            hctx.arc(cx, cy, rr, 0, Math.PI * 2);
          }
          hctx.stroke();
        }
      }
    }
    dirty = null;
    rebuildNormals();
  }

  function serialize() {
    return height.toDataURL('image/webp', 0.9);
  }
  function restore(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        hctx.drawImage(img, 0, 0, W, H);
        rebuildNormals();
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = dataUrl;
    });
  }

  return { mesh, rakeStart, rakeMove, rakeEnd, update, drawClassic, serialize, restore, width, depth, heightCanvas: height };
}
