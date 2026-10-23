// Tōrō (lanterna de pedra, estilo Kasuga): base, coluna, plataforma, caixa de
// luz com janelas, telhado hexagonal de cantos curvados e a joia no topo.
import * as THREE from 'three';
import { paintGeometry, bakeGroup } from '../core/materials.js';
import { createNoise } from '../core/noise.js';
import { getKit } from './kit.js';

// Material da "chama" dentro da lanterna — um só, para o ciclo do dia ajustar todas.
export const lanternGlow = new THREE.MeshStandardMaterial({
  color: 0xffe0b0, emissive: 0xffa04a, emissiveIntensity: 2, roughness: 1,
});

// Halo em volta da caixa de luz. Com só 4 luzes pontuais no jogo, as
// lanternas mais distantes não iluminam o entorno; o halo as mantém acesas.
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const lanternHalo = new THREE.SpriteMaterial({
  map: glowTexture(), color: 0xffa860, transparent: true, opacity: 0.4,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
});

function lathe(points, segments, flat = true) {
  let g = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
  if (flat) {
    g = g.toNonIndexed();
    g.computeVertexNormals();
  }
  return g;
}

function stoneTint(seed) {
  const nz = createNoise(seed);
  return (c, x, y, z) => {
    const n = nz.fbm3(x * 4, y * 4, z * 4, 3);
    c.multiplyScalar(0.85 + n * 0.35);
    // líquen esverdeado nas partes de cima/abrigadas
    const lichen = Math.max(0, nz.fbm3(x * 2 + 5, y * 2, z * 2, 2) - 0.1) * 1.6;
    c.lerp(new THREE.Color(0x5d6a45), Math.min(lichen, 0.45));
    return c;
  };
}

export function createLantern(seed = 1) {
  const kit = getKit();
  const mat = kit.stoneFine;
  const tint = stoneTint(seed);
  const base = 0x8b877e;
  const group = new THREE.Group();
  const add = (geo, y = 0, flatTint = true) => {
    paintGeometry(geo, base, flatTint ? tint : null);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // kiso (base)
  add(lathe([[0, 0], [0.44, 0], [0.44, 0.1], [0.38, 0.16], [0.3, 0.2], [0.22, 0.24], [0, 0.24]], 6));
  // sao (coluna) com anéis
  add(new THREE.CylinderGeometry(0.12, 0.14, 0.78, 18), 0.24 + 0.39);
  add(new THREE.TorusGeometry(0.135, 0.022, 8, 20).rotateX(Math.PI / 2), 0.62);
  add(new THREE.TorusGeometry(0.13, 0.018, 8, 20).rotateX(Math.PI / 2), 0.68);
  // chudai (plataforma)
  add(lathe([[0, 0], [0.16, 0], [0.3, 0.08], [0.36, 0.15], [0.36, 0.2], [0, 0.2]], 6), 1.0);

  // hibukuro (caixa de luz): 6 pilares + painéis em faces alternadas
  const yBox = 1.2, hBox = 0.38, rBox = 0.27;
  add(new THREE.CylinderGeometry(rBox + 0.02, rBox + 0.02, 0.04, 6), yBox + 0.02);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const post = new THREE.BoxGeometry(0.06, hBox, 0.06);
    const m = add(post, yBox + hBox / 2 + 0.04);
    m.position.x = Math.sin(a) * rBox;
    m.position.z = Math.cos(a) * rBox;
    m.rotation.y = a;
    const fa = a + Math.PI / 6;
    const side = 2 * rBox * Math.sin(Math.PI / 6);
    if (i % 3 !== 0) {
      // painel fechado com recorte redondo (lua) sugerido por um disco mais escuro
      const panel = new THREE.BoxGeometry(side * 0.92, hBox * 0.92, 0.035);
      const p = add(panel, yBox + hBox / 2 + 0.04);
      const ap = rBox * Math.cos(Math.PI / 6) - 0.01;
      p.position.x = Math.sin(fa) * ap;
      p.position.z = Math.cos(fa) * ap;
      p.rotation.y = fa;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), lanternGlow);
      hole.position.set(Math.sin(fa) * (ap + 0.019), yBox + hBox / 2 + 0.06, Math.cos(fa) * (ap + 0.019));
      hole.rotation.y = fa;
      group.add(hole);
    } else {
      // janela aberta com treliça
      for (let k = 0; k < 2; k++) {
        const bar = new THREE.BoxGeometry(0.02, hBox * 0.9, 0.02);
        const ap = rBox * Math.cos(Math.PI / 6);
        const b = add(bar, yBox + hBox / 2 + 0.04);
        const off = (k - 0.5) * side * 0.4;
        b.position.x = Math.sin(fa) * ap + Math.cos(fa) * off;
        b.position.z = Math.cos(fa) * ap - Math.sin(fa) * off;
        b.rotation.y = fa;
      }
    }
  }
  // brilho interno
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 6), lanternGlow);
  core.position.y = yBox + 0.04 + hBox / 2;
  group.add(core);

  // kasa (telhado) com beirais levemente erguidos
  const roof = lathe([[0, 0.34], [0.1, 0.32], [0.24, 0.22], [0.42, 0.1], [0.56, 0.035], [0.6, 0.05], [0.6, 0.0], [0.5, -0.04], [0, -0.04]], 6);
  const roofMesh = add(roof, yBox + hBox + 0.08);
  roofMesh.rotation.y = Math.PI / 6;
  // warabite: pontas enroladas nos 6 cantos
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const curl = new THREE.SphereGeometry(0.045, 10, 8);
    const c = add(curl, yBox + hBox + 0.08 + 0.07);
    c.position.x = Math.sin(a) * 0.6;
    c.position.z = Math.cos(a) * 0.6;
  }
  // hōju (joia) suave
  add(lathe([[0, 0], [0.09, 0], [0.11, 0.04], [0.07, 0.09], [0.1, 0.13], [0.13, 0.2], [0.11, 0.27], [0.06, 0.33], [0.02, 0.37], [0, 0.38]], 14, false), yBox + hBox + 0.08 + 0.33);

  bakeGroup(group);
  const halo = new THREE.Sprite(lanternHalo);
  halo.position.y = yBox + 0.24;
  halo.scale.setScalar(1.7);
  halo.raycast = () => {}; // não atrapalha o clique em outros objetos
  group.add(halo);
  group.userData.radius = 0.6;
  group.userData.material = 'stone';
  group.userData.lights = [{ offset: new THREE.Vector3(0, yBox + 0.24, 0), color: 0xffa24f, intensity: 5, distance: 9, flicker: true, day: 0 }];
  return group;
}
