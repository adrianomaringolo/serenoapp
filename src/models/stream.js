// Riacho: uma fita de água que segue o leito descendo em degraus (poços
// calmos e pequenas cascatas). O relevo e a espuma correm rio abaixo numa
// coordenada de "tempo de viagem" (quanto a água leva para chegar a cada
// ponto): onde ela acelera, o desenho se estica em fios e anda mais rápido,
// sem nunca parecer subir. A espuma nasce nas cascatas e se desfaz rio abaixo, o raso deixa ver o leito e tocar
// a água abre anéis. Nas cascatas, uma garoa de gotículas sobe da queda.
import * as THREE from 'three';
import { globalUniforms } from '../core/materials.js';
import { rng } from '../core/noise.js';
import { getKit } from './kit.js';

// rows: fatias do riacho, de cima para baixo:
//   [{ x, z, y (nível da água), dx, dz (direção da correnteza), hw (meia largura), s, speed, foam }]
// bedAt(x, z): altura do leito (para a cor e a transparência pela profundidade)
// envIntensity: quanto do céu a água reflete; reflCap: teto do reflexo (sob a
// copa, o brilho do horizonte perto do sol não chega à água)
export function createStream({ rows, bedAt, margin = 0.9, across = 10, envIntensity = 1, reflCap = null }) {
  const kit = getKit();
  const nCols = across + 1;
  const pos = new Float32Array(rows.length * nCols * 3);
  const uv = new Float32Array(rows.length * nCols * 2);
  const flow = new Float32Array(rows.length * nCols * 4); // velocidade, espuma, profundidade, tempo de viagem
  // tempo de viagem acumulado (s); a velocidade mínima evita que o desenho se
  // amontoe nos poços quase parados
  let tau = 0;
  rows.forEach((r, i) => {
    if (i) tau += (r.s - rows[i - 1].s) / Math.max(0.25, (r.speed + rows[i - 1].speed) / 2);
    const sx = -r.dz, sz = r.dx; // lado (perpendicular à correnteza)
    const half = r.hw + margin;
    for (let j = 0; j < nCols; j++) {
      const u = (j / across) * 2 - 1;
      const x = r.x + sx * u * half, z = r.z + sz * u * half;
      const k = i * nCols + j;
      pos.set([x, r.y, z], k * 3);
      uv.set([u * half, r.s], k * 2);
      const depth = r.y - bedAt(x, z);
      // corredeira no raso perto da margem: um pouco de espuma também
      const shallow = Math.max(0, Math.min(1, (0.14 - depth) / 0.12)) * 0.35 * Math.min(1, r.speed * 2);
      flow.set([r.speed, Math.min(1, r.foam + shallow), Math.max(0, depth), tau], k * 4);
    }
  });
  const idx = [];
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < across; j++) {
      const a = i * nCols + j, b = a + 1, c = a + nCols, d = c + 1;
      idx.push(a, b, c, b, d, c); // face para cima
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aFlow', new THREE.BufferAttribute(flow, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const normal = kit.waterNormal.clone();
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.needsUpdate = true;
  const foamTex = kit.stoneDetail; // grão cinza que repete: serve de ruído da espuma
  const ripples = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0));
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x183a34, roughness: 0.035, metalness: 0, transparent: true,
    normalMap: normal, normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: envIntensity,
    ior: 1.33,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = globalUniforms.uTime;
    sh.uniforms.uFoamMap = { value: foamTex };
    sh.uniforms.uRipples = { value: ripples };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFlow;\nvarying vec4 vFlow;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = aFlow;\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uT;
        uniform sampler2D uFoamMap;
        uniform vec4 uRipples[6];
        varying vec4 vFlow;
        varying vec3 vWPos;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // ao longo: tempo de viagem menos o tempo (o desenho desce o riacho na
        // velocidade da água); de lado: metros
        float tt = vFlow.w - uT;
        float across = vNormalMapUv.x;
        float fx = 0.55 + vFlow.x * 0.9;
        float fA = texture2D(uFoamMap, vec2(across * fx, tt * 0.3)).r;
        float fB = texture2D(uFoamMap, vec2(across * fx * 0.7 + 0.37, tt * 0.21 + 0.5)).r;
        float fC = texture2D(uFoamMap, vec2(across * fx * 2.6 + 0.11, tt * 0.75)).r;
        float foamN = ((fA + fB) * 0.35 + fC * 0.3 - 0.5) * 2.2 + 0.5; // mais contraste
        float fAmt = vFlow.y;
        float foamAmt = smoothstep(0.82 - fAmt * 0.55, 0.95 - fAmt * 0.45, foamN + fAmt * 0.12) * smoothstep(0.0, 0.12, fAmt);
        float dep = vFlow.z;
        // raso: transparente e mais claro (o leito aparece); fundo: verde escuro
        diffuseColor.rgb = mix(diffuseColor.rgb * 1.1, diffuseColor.rgb * 0.5, smoothstep(0.0, 0.7, dep));
        diffuseColor.a = mix(0.42, 0.93, smoothstep(0.02, 0.6, dep));
        foamAmt *= 0.55 + 0.45 * smoothstep(0.1, 0.8, fAmt); // espuma rala longe da queda
        foamAmt = max(foamAmt, smoothstep(0.7, 1.0, fAmt) * (0.4 + 0.45 * fC)); // a queda é quase toda branca
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.85, 0.84) * (0.85 + fC * 0.3), foamAmt);
        diffuseColor.a = mix(diffuseColor.a, 0.95, foamAmt);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.75, foamAmt);`)
      .replace('#include <lights_fragment_maps>', reflCap == null ? '#include <lights_fragment_maps>' : `#include <lights_fragment_maps>
        #if defined( RE_IndirectSpecular )
          radiance = min(radiance, vec3(${reflCap.toFixed(3)}));
        #endif`)
      .replace('#include <normal_fragment_maps>', `
        vec3 nA = texture2D(normalMap, vec2(across * 0.42, tt * 0.13)).xyz * 2.0 - 1.0;
        vec3 nB = texture2D(normalMap, vec2(across * 0.3 + 0.5, tt * 0.09 + 0.3)).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(nA + nB);
        mapN.xy *= normalScale * (0.6 + min(vFlow.x, 1.6) * 0.9 + foamAmt * 0.8);
        normal = normalize(tbn * mapN);
        // anéis de toque (no plano do mundo)
        vec2 rp = vec2(0.0);
        for (int i = 0; i < 6; i++) {
          vec4 r = uRipples[i];
          if (r.w <= 0.0) continue;
          vec2 dv = vWPos.xz - r.xy;
          float dist = length(dv);
          float front = r.z * 0.8;
          float ring = sin((dist - front) * 20.0) * exp(-pow((dist - front) * 3.2, 2.0));
          rp += normalize(dv + 1e-4) * ring * r.w * exp(-r.z * 1.1) * 0.6;
        }
        normal = normalize(normal + (viewMatrix * vec4(rp.x, 0.0, rp.y, 0.0)).xyz);`);
  };
  mat.customProgramCacheKey = () => `stream-${reflCap}`;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;

  let next = 0;
  function ripple(x, z, strength = 1) {
    ripples[next].set(x, z, 0, strength);
    next = (next + 1) % ripples.length;
  }
  function update(dt) {
    for (const r of ripples) {
      if (r.w <= 0) continue;
      r.z += dt;
      if (r.z > 4) r.w = 0;
    }
  }
  return { mesh, ripple, update };
}

// Garoa das cascatas: gotículas que sobem da queda e se desfazem.
// spots: [{ x, y, z, w (largura da queda), dx, dz }]
export function createSpray(spots, { perSpot = 46, seed = 3 } = {}) {
  const R = rng(seed);
  const n = spots.length * perSpot;
  const pos = new Float32Array(n * 3), rnd = new Float32Array(n * 3);
  let k = 0;
  for (const s of spots) {
    for (let i = 0; i < perSpot; i++, k++) {
      const u = (R() - 0.5) * s.w;
      pos.set([s.x - s.dz * u + s.dx * (R() * 0.6), s.y, s.z + s.dx * u + s.dz * (R() * 0.6)], k * 3);
      rnd.set([R(), R(), R()], k * 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 3));
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uScale: { value: 1 }, uColor: { value: new THREE.Color(1, 1, 1) }, uLight: { value: 1 },
  }]);
  uniforms.uTime = globalUniforms.uTime;
  uniforms.uScale = globalUniforms.uPointScale;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime, uScale;
      attribute vec3 aRnd;
      varying float vA;
      #include <fog_pars_vertex>
      void main() {
        float life = fract(uTime * (0.22 + aRnd.x * 0.2) + aRnd.y);
        vec3 p = position;
        p.y += life * (0.5 + aRnd.z * 0.7);
        p.x += sin(uTime * 0.7 + aRnd.y * 30.0) * 0.25 * life;
        p.z += cos(uTime * 0.6 + aRnd.x * 30.0) * 0.25 * life;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vA = sin(life * 3.14159) * 0.07 * smoothstep(2.0, 6.0, -mvPosition.z);
        gl_PointSize = (0.5 + life * 0.9) * uScale / -mvPosition.z;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uLight;
      varying float vA;
      #include <fog_pars_fragment>
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.0, 1.0, d)) * vA;
        gl_FragColor = vec4(uColor * uLight, a);
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  // a garoa acompanha a luz do lugar (de noite, quase some)
  const setLight = (color, k) => { uniforms.uColor.value.copy(color); uniforms.uLight.value = k; };
  return { points, setLight };
}
