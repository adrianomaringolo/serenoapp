// Água espelhada: o Reflector do three renderiza a cena vista de baixo da
// superfície, e este shader mistura esse reflexo (ondulado por dois normal
// maps que deslizam) com a cor da água funda, pelo efeito Fresnel: olhando
// rente, a água é espelho; olhando de cima, vê-se a cor escura do lago.
//
// Custo: uma renderização extra da cena, em meia resolução e sem MSAA. Como o
// custo do jogo é por pixel, isso é ~1/4 de um quadro (ver scripts/bench.js).
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { globalUniforms } from './materials.js';

const WaterShader = {
  name: 'MirrorWater',
  uniforms: THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      tNormal: { value: null },
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x0d2224) },
      uDistort: { value: 0.035 },
      uRipples: { value: [] },
    },
  ]),
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <fog_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform vec3 color;
    uniform vec3 uDeep;
    uniform float uTime;
    uniform float uDistort;
    uniform vec4 uRipples[8]; // xz do centro, idade (s), força
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <fog_pars_fragment>

    void main() {
      vec2 p = vWorld.xz;
      vec2 n1 = texture2D(tNormal, p * 0.045 + vec2(uTime * 0.006, uTime * 0.004)).rg * 2.0 - 1.0;
      vec2 n2 = texture2D(tNormal, p * 0.13 - vec2(uTime * 0.009, -uTime * 0.007)).rg * 2.0 - 1.0;
      vec2 d = (n1 * 0.6 + n2 * 0.4);

      // anéis de onda (toques na água, peixes): somam no deslocamento
      for (int i = 0; i < 8; i++) {
        vec4 r = uRipples[i];
        if (r.w <= 0.0) continue;
        vec2 dv = p - r.xy;
        float dist = length(dv);
        float front = r.z * 0.9;
        float ring = sin((dist - front) * 18.0) * exp(-pow((dist - front) * 3.0, 2.0));
        d += normalize(dv + 1e-4) * ring * r.w * exp(-r.z * 0.9) * 2.5;
      }

      vec3 V = normalize(cameraPosition - vWorld);
      vec3 N = normalize(vec3(d.x * 0.6, 1.0, d.y * 0.6));
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(V, N), 0.0), 4.0);

      // mais longe, menos distorção (senão a água distante vira ruído)
      float far = clamp(length(cameraPosition - vWorld) / 60.0, 0.0, 1.0);
      vec4 proj = vUv;
      proj.xy += d * uDistort * (1.0 - far * 0.7) * proj.w;
      vec3 refl = texture2DProj(tDiffuse, proj).rgb * color;

      vec3 col = mix(uDeep, refl, clamp(fres * 1.1 + 0.18, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
};

export function createMirrorWater({ geometry, renderer, normalMap, level = 0, scale = 0.5, quality = 'desktop' }) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const k = quality === 'mobile' ? scale * 0.6 : scale;
  const water = new Reflector(geometry, {
    textureWidth: Math.round(size.x * k),
    textureHeight: Math.round(size.y * k),
    clipBias: 0.002,
    shader: WaterShader,
    multisample: 0,
    color: 0xd8e2e6,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = level;
  const u = water.material.uniforms;
  u.tNormal.value = normalMap;
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  u.uRipples.value = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0));
  water.material.fog = true;

  // ondas: até 8 ao mesmo tempo, recicladas
  let next = 0;
  function ripple(x, z, strength = 1) {
    u.uRipples.value[next].set(x, z, 0, strength);
    next = (next + 1) % 8;
  }

  function update(dt) {
    u.uTime.value = globalUniforms.uTime.value;
    for (const r of u.uRipples.value) {
      if (r.w <= 0) continue;
      r.z += dt;
      if (r.z > 5) r.w = 0;
    }
  }

  // a resolução do reflexo acompanha a da tela (inclusive a dinâmica)
  function resize(w, h) {
    water.getRenderTarget().setSize(Math.max(64, Math.round(w * k)), Math.max(64, Math.round(h * k)));
  }

  function setDeep(c) {
    u.uDeep.value.copy(c);
  }

  return { mesh: water, update, ripple, resize, setDeep, level };
}
