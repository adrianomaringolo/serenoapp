// Materiais compartilhados e "injeções" de shader reaproveitáveis:
//  - triplanar: textura de detalhe projetada pelos 3 eixos (pedra, musgo), sem
//    depender de UV — essencial para pedras geradas por ruído.
//  - vento: balanço de grama, bambu e folhas, calculado na GPU.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Uniforms globais (tempo e força do vento), compartilhados por todos os shaders.
export const globalUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uPointScale: { value: innerHeight / 2 }, // metade da altura do buffer, para pontos em pixels
};

// Pinta uma geometria com atributo `color` (exigido por materiais com vertexColors).
// colorFn(x, y, z, nx, ny, nz) → THREE.Color opcional; senão usa `base`.
export function paintGeometry(geo, base, colorFn) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const arr = new Float32Array(pos.count * 3);
  const c = new THREE.Color(base);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let out = c;
    if (colorFn) {
      tmp.copy(c);
      out = colorFn(tmp, pos.getX(i), pos.getY(i), pos.getZ(i), nrm ? nrm.getX(i) : 0, nrm ? nrm.getY(i) : 1, nrm ? nrm.getZ(i) : 0) || tmp;
    }
    arr[i * 3] = out.r; arr[i * 3 + 1] = out.g; arr[i * 3 + 2] = out.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function triplanarMaterial(detailTex, { scale = 1.5, contrast = 1.3, roughness = 0.9, roughVar = 0.35, ...rest } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, ...rest });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: detailTex };
    sh.uniforms.uDetailScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriPos = position;\nvTriNrm = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D uDetail;\nuniform float uDetailScale;\nvarying vec3 vTriPos;\nvarying vec3 vTriNrm;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 triW = pow(abs(normalize(vTriNrm)), vec3(4.0));
        triW /= (triW.x + triW.y + triW.z);
        vec3 triP = vTriPos * uDetailScale;
        float triD = texture2D(uDetail, triP.yz).r * triW.x
                   + texture2D(uDetail, triP.xz).r * triW.y
                   + texture2D(uDetail, triP.xy).r * triW.z;
        float triD2 = texture2D(uDetail, triP.zx * 3.7).r * triW.y
                    + texture2D(uDetail, triP.zy * 3.7).r * triW.x
                    + texture2D(uDetail, triP.yx * 3.7).r * triW.z;
        triD = mix(triD, triD2, 0.35);
        diffuseColor.rgb *= mix(1.0, 0.25 + triD * 1.5, ${contrast.toFixed(3)} * 0.6);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (0.5 - triD) * ${roughVar.toFixed(3)}, 0.2, 1.0);`,
      );
  };
  m.customProgramCacheKey = () => `tri-${contrast}-${roughVar}`;
  return m;
}

// Vento. mode:
//  'local' — amplitude pela altura do vértice na geometria (grama: cada tufo
//            balança a partir da própria base, em qualquer altura do terreno).
//  'world' — amplitude pela altura no mundo (bambu e folhas balançam juntos).
//  'hang'  — ramos pendentes (salgueiro): presos em y=0, a ponta de baixo balança mais.
export function applyWind(material, { mode = 'local', amp = 0.2, height = 1, base = 0, flutter = 0, power = 1.6 } = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTime = globalUniforms.uTime;
    sh.uniforms.uWind = globalUniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWind;
        vec3 windOffset(vec3 wp, float hNorm) {
          float ph = wp.x * 0.31 + wp.z * 0.23;
          float s = sin(uTime * 1.1 + ph) * 0.55 + sin(uTime * 2.3 + ph * 1.9) * 0.2 + sin(uTime * 0.37 + ph * 0.5) * 0.6;
          float k = pow(clamp(hNorm, 0.0, 1.5), ${power.toFixed(2)}) * ${amp.toFixed(3)} * uWind;
          vec3 o = vec3(s * k, 0.0, s * k * 0.4);
          o += vec3(sin(uTime * 6.0 + wp.x * 5.0 + wp.y * 7.0), sin(uTime * 7.0 + wp.z * 6.0) * 0.5, cos(uTime * 5.3 + wp.y * 4.0)) * ${flutter.toFixed(3)} * uWind;
          return o;
        }`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 windWorld = modelMatrix * mvPosition;
        ${mode === 'local'
          ? `windWorld.xyz += windOffset(windWorld.xyz, position.y / ${height.toFixed(3)});`
          : mode === 'hang'
            ? `windWorld.xyz += windOffset(windWorld.xyz, -position.y / ${height.toFixed(3)});`
            : `windWorld.xyz += windOffset(windWorld.xyz, (windWorld.y - ${base.toFixed(3)}) / ${height.toFixed(3)});`}
        mvPosition = viewMatrix * windWorld;
        gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}-wind-${mode}-${amp}-${height}-${base}-${flutter}`;
  return material;
}

// Material de profundidade (sombra) que respeita o recorte da folha e o vento.
export function leafDepthMaterial(alphaMap, wind) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: alphaMap, alphaTest: 0.5 });
  if (wind) applyWind(m, wind);
  return m;
}

// Junta os filhos de um grupo que compartilham material numa malha só
// (uma lanterna tem ~30 peças: 30 draw calls viram 2).
export function bakeGroup(group) {
  group.updateMatrix();
  const byMat = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || child.isInstancedMesh || child.children.length || child.userData.keep) continue;
    child.updateMatrix();
    let g = child.geometry.clone().applyMatrix4(child.matrix);
    if (g.index) g = g.toNonIndexed();
    const list = byMat.get(child.material) || [];
    list.push({ g, cast: child.castShadow, receive: child.receiveShadow, order: child.renderOrder });
    byMat.set(child.material, list);
    group.remove(child);
  }
  for (const [mat, list] of byMat) {
    const names = Object.keys(list[0].g.attributes).filter((n) => list.every((x) => x.g.attributes[n]));
    for (const x of list) for (const n of Object.keys(x.g.attributes)) if (!names.includes(n)) x.g.deleteAttribute(n);
    const merged = mergeGeometries(list.map((x) => x.g));
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = list.some((x) => x.cast);
    m.receiveShadow = list.some((x) => x.receive);
    m.renderOrder = list[0].order;
    group.add(m);
  }
  return group;
}

// Funde toda a decoração fixa de um grupo (em qualquer profundidade) numa
// malha por material. Cada peça separada custa uma chamada de desenho em cada
// passe (cena, reflexo do lago, sombra); árvores e pedras que nunca se mexem
// não precisam disso. InstancedMesh, sprites e o que tiver userData.keep ficam.
export function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const remove = [];
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.keep || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return;
    if (Array.isArray(o.material)) return;
    let g = o.geometry.clone().applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    // só junta geometrias com os mesmos atributos (vertexColors sem cor viraria preto)
    const sig = Object.keys(g.attributes).sort().join(',');
    const key = `${o.material.uuid}|${sig}|${o.castShadow}|${o.receiveShadow}`;
    if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [] });
    groups.get(key).geos.push(g);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const { mat, cast, receive, geos } of groups.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    root.add(mesh);
  }
  return remove.length;
}

// Junta InstancedMesh de mesma geometria e material (ex.: as folhinhas de 14
// arbustos) numa só, com as matrizes levadas para o espaço do grupo. Malhas
// animadas por instância devem ter userData.keep.
export function mergeInstanced(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isInstancedMesh || o.userData.keep || o.morphTexture) return;
    const key = `${o.geometry.uuid}|${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${!!o.instanceColor}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  const m = new THREE.Matrix4(), rel = new THREE.Matrix4(), c = new THREE.Color();
  let merged = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const total = list.reduce((a, o) => a + o.count, 0);
    const first = list[0];
    const out = new THREE.InstancedMesh(first.geometry, first.material, total);
    out.castShadow = first.castShadow;
    out.receiveShadow = first.receiveShadow;
    out.customDepthMaterial = first.customDepthMaterial;
    let k = 0;
    for (const o of list) {
      rel.multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < o.count; i++, k++) {
        o.getMatrixAt(i, m);
        out.setMatrixAt(k, m.premultiply(rel));
        if (o.instanceColor) { o.getColorAt(i, c); out.setColorAt(k, c); }
      }
      o.parent.remove(o);
      merged++;
    }
    out.computeBoundingSphere();
    root.add(out);
  }
  return merged;
}
