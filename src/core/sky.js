// Céu pintado em shader: degradê horizonte→zênite, brilho e disco do sol (ou
// da lua), nuvens de ruído que passam devagar e estrelas que cintilam à noite.
// O mesmo céu alimenta a luz ambiente dos materiais (environment map via PMREM).
import * as THREE from 'three';
import { globalUniforms } from './materials.js';

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunSize;
  uniform float uGlow;
  uniform float uStars;
  uniform float uClouds;
  uniform vec3 uCloudColor;
  uniform vec3 uCloudShadow;
  uniform float uTime;
  varying vec3 vDir;

  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 1.0, max(h, 0.0)), 0.5));
    col = mix(col, uGround, smoothstep(0.0, -0.2, h));

    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    // brilho largo junto ao horizonte + halo + disco
    float horizonBand = 1.0 - smoothstep(0.0, 0.45, abs(h));
    col += uSunColor * pow(sd, 4.0) * 0.45 * uGlow * (0.4 + horizonBand);
    col += uSunColor * pow(sd, 48.0) * 0.6 * uGlow;
    float disc = smoothstep(uSunSize, uSunSize + 0.0008, sd);
    col += uSunColor * disc * 4.0;

    // nuvens: projetadas num "teto" plano, mais finas no horizonte
    if (h > 0.0 && uClouds > 0.001) {
      vec2 cp = d.xz / (h + 0.18) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
      float c = fbm(cp);
      float cover = smoothstep(0.52, 0.85, c + (uClouds - 0.5) * 0.25);
      cover *= smoothstep(0.0, 0.18, h);
      float lit = 0.35 + 0.65 * pow(sd, 3.0) + 0.3 * (1.0 - c);
      vec3 cc = mix(uCloudShadow, uCloudColor, clamp(lit, 0.0, 1.0));
      col = mix(col, cc, cover * clamp(uClouds, 0.0, 1.0));
    }

    // estrelas
    if (uStars > 0.001 && h > 0.0) {
      vec3 sp = d * 260.0;
      vec3 cell = floor(sp);
      float r = hash3(cell);
      float star = step(0.9975, r);
      float dist = length(fract(sp) - 0.5);
      float tw = 0.55 + 0.45 * sin(uTime * (1.0 + r * 3.0) + r * 60.0);
      col += vec3(0.85, 0.9, 1.0) * star * smoothstep(0.35, 0.0, dist) * tw * uStars * smoothstep(0.02, 0.25, h) * 2.0;
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 0.1, -1) },
    uSunColor: { value: new THREE.Color() },
    uSunSize: { value: 0.9994 },
    uGlow: { value: 1 },
    uStars: { value: 0 },
    uClouds: { value: 0.5 },
    uCloudColor: { value: new THREE.Color() },
    uCloudShadow: { value: new THREE.Color() },
    uTime: globalUniforms.uTime,
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const geo = new THREE.SphereGeometry(450, 48, 24);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;

  // Cena separada só com o céu, para gerar o mapa de ambiente.
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(geo, material));

  return { mesh, uniforms, envScene };
}
