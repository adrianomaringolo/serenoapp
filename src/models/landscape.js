// Paisagem distante reaproveitável: anéis de montanhas que somem na névoa.
import * as THREE from 'three';
import { createNoise } from '../core/noise.js';

// layers: [raio, altura máx., quanto se mistura ao horizonte]
export function createMountains({ layers: spec = [[125, 16, 0.42], [175, 30, 0.6], [240, 52, 0.78]], seed = 77 } = {}) {
  const group = new THREE.Group();
  const layers = [];
  const nzM = createNoise(seed);
  spec.forEach(([radius, hmax, k], li) => {
    const N = 256;
    const pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const u = Math.cos(a) * 3 + li * 10, v = Math.sin(a) * 3;
      const ridge = 1 - Math.abs(nzM.fbm2(u, v, 5));
      const h = hmax * (0.25 + 0.75 * Math.pow(ridge, 2.2)) * (0.6 + 0.4 * Math.sin(a * 2 + li));
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      pos.push(x, -4, z, x, h, z);
      if (i < N) {
        const b = i * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x556070, fog: false, side: THREE.DoubleSide }));
    m.renderOrder = -0.5;
    layers.push({ mesh: m, k });
    group.add(m);
  });
  function apply(state) {
    for (const l of layers) l.mesh.material.color.copy(state.mountain).lerp(state.horizon, l.k);
  }
  return { group, apply };
}
