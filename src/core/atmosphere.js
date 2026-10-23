// Atmosfera reaproveitável entre ambientes: vaga-lumes e bancos de névoa.
import * as THREE from 'three';
import { globalUniforms } from './materials.js';
import { rng } from './noise.js';

export function createFireflies({ count = 90, area = [-14, 14, -12, 10], yRange = [0.3, 2.6], heightAt = () => 0, seed = 5 } = {}) {
  const R = rng(seed);
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = THREE.MathUtils.lerp(area[0], area[1], R());
    const z = THREE.MathUtils.lerp(area[2], area[3], R());
    pos[i * 3] = x;
    pos[i * 3 + 1] = heightAt(x, z) + THREE.MathUtils.lerp(yRange[0], yRange[1], R());
    pos[i * 3 + 2] = z;
    seeds[i] = R();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const uniforms = {
    uTime: globalUniforms.uTime,
    uIntensity: { value: 0 },
    uScale: globalUniforms.uPointScale,
    uColor: { value: new THREE.Color(1.0, 0.85, 0.35) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime, uScale, uIntensity;
      attribute float aSeed;
      varying float vA;
      void main() {
        vec3 p = position;
        float s = aSeed * 50.0;
        p.x += sin(uTime * 0.21 + s) * 1.2 + sin(uTime * 0.53 + s * 1.3) * 0.4;
        p.z += cos(uTime * 0.17 + s * 0.7) * 1.2 + sin(uTime * 0.47 + s * 2.1) * 0.4;
        p.y += sin(uTime * 0.31 + s * 1.9) * 0.45;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float blink = pow(0.5 + 0.5 * sin(uTime * (0.7 + aSeed * 0.9) + s), 3.0);
        vA = blink * uIntensity;
        gl_PointSize = (0.18 + blink * 0.1) * uScale / -mv.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float core = smoothstep(0.35, 0.0, d);
        float halo = smoothstep(1.0, 0.0, d) * 0.35;
        float a = (core + halo) * vA;
        gl_FragColor = vec4(uColor * (2.0 + core * 4.0) * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}

// Névoa baixa: bancos grandes e translúcidos que derivam devagar e somem perto
// da câmera (para não virar uma mancha na cara de quem olha). Todos os bancos
// são uma InstancedMesh de quadrados virados para a câmera no próprio shader:
// 1 chamada de desenho (eram ~28 sprites, e o lago os desenha de novo no reflexo).
export function createMist(texture, { count = 18, area = [-22, 22, -18, 8], yRange = [0.2, 1.6], size = [7, 13], heightAt = () => 0, seed = 9 } = {}) {
  const R = rng(seed);
  const geo = new THREE.PlaneGeometry(1, 1);
  const params = new Float32Array(count * 4); // largura, altura, rotação, opacidade
  const items = [];
  for (let i = 0; i < count; i++) {
    const x = THREE.MathUtils.lerp(area[0], area[1], R());
    const z = THREE.MathUtils.lerp(area[2], area[3], R());
    const sc = THREE.MathUtils.lerp(size[0], size[1], R());
    params.set([sc, sc * 0.45, R() * Math.PI, 0], i * 4);
    items.push({ p: new THREE.Vector3(x, heightAt(x, z) + THREE.MathUtils.lerp(yRange[0], yRange[1], R()), z), speed: 0.08 + R() * 0.12, base: 0.06 + R() * 0.07, phase: R() * 10 });
  }
  const attr = new THREE.InstancedBufferAttribute(params, 4);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aMist', attr);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uColor: { value: new THREE.Color(1, 1, 1) } }]);
  uniforms.uMap.value = texture;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec4 aMist;
      varying vec2 vUv;
      varying float vA;
      #include <fog_pars_vertex>
      void main() {
        vec3 centre = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(centre, 1.0);
        float c = cos(aMist.z), s = sin(aMist.z);
        vec2 q = position.xy * aMist.xy;
        mvPosition.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
        vUv = uv;
        vA = aMist.w * smoothstep(4.0, 11.0, -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vA;
      #include <fog_pars_fragment>
      void main() {
        vec4 t = texture2D(uMap, vUv);
        gl_FragColor = vec4(uColor * t.rgb, t.a * vA);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  const group = new THREE.Group();
  group.add(mesh);
  const m4 = new THREE.Matrix4();
  function update(dt, t, camera, amount, color) {
    items.forEach((m, i) => {
      m.p.x += m.speed * dt;
      if (m.p.x > area[1] + 6) m.p.x = area[0] - 6;
      mesh.setMatrixAt(i, m4.makeTranslation(m.p.x, m.p.y, m.p.z));
      params[i * 4 + 3] = m.base * amount * (0.75 + 0.25 * Math.sin(t * 0.2 + m.phase));
    });
    mesh.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
    uniforms.uColor.value.copy(color);
  }
  return { group, update };
}

// Raios de sol entre as copas: faixas de luz aditivas que descem na direção
// da luz (sol ou lua) e caem em clareiras no chão. Cada faixa é um quadrado
// esticado ao longo do raio e virado para a câmera em volta do próprio eixo
// (como um cilindro), tudo numa InstancedMesh. Somem perto da câmera e na
// névoa, e a intensidade vem do momento do dia.
// spots: [{ x, z, w }] — onde cada raio toca o chão e a largura dele;
// height: a que altura acima do chão o raio atravessa a copa.
export function createLightShafts({ spots, groundAt = () => 0, height = 18, seed = 13 } = {}) {
  const R = rng(seed);
  const count = spots.length;
  const geo = new THREE.PlaneGeometry(1, 1, 1, 8).translate(0, -0.5, 0); // y: 0 (copa) → -1 (chão)
  const shaft = new Float32Array(count * 4); // largura, comprimento, semente, intensidade própria
  spots.forEach((t, i) => shaft.set([t.w, height, R(), 0.6 + R() * 0.4], i * 4));
  const attr = new THREE.InstancedBufferAttribute(shaft, 4);
  geo.setAttribute('aShaft', attr);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uDir: { value: new THREE.Vector3(0, -1, 0) },
      uColor: { value: new THREE.Color(1, 0.9, 0.7) },
      uIntensity: { value: 0 },
    }]),
    vertexShader: /* glsl */ `
      uniform vec3 uDir;
      attribute vec4 aShaft;
      varying vec2 vUv;
      varying float vA;
      varying float vSeed;
      #include <fog_pars_vertex>
      void main() {
        vec3 top = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float along = -position.y; // 0 na copa, 1 no chão
        vec3 axisP = top + uDir * along * aShaft.y;
        vec3 side = normalize(cross(uDir, cameraPosition - axisP));
        // o raio se abre um pouco ao descer (luz difusa na névoa)
        vec3 wp = axisP + side * position.x * aShaft.x * (0.7 + along * 0.6);
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vUv = vec2(position.x + 0.5, along);
        vSeed = aShaft.z;
        vA = aShaft.w * smoothstep(3.0, 12.0, -mvPosition.z);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uTime;
      varying vec2 vUv;
      varying float vA;
      varying float vSeed;
      #include <fog_pars_fragment>
      void main() {
        float x = vUv.x * 2.0 - 1.0;
        // fios de luz dentro da faixa, que respiram devagar
        float streak = 0.55 + 0.25 * sin(vUv.x * 19.0 + vSeed * 40.0) + 0.2 * sin(vUv.x * 7.0 - vSeed * 13.0 + uTime * 0.07);
        float edge = pow(max(1.0 - x * x, 0.0), 1.6);
        float ends = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
        float breathe = 0.75 + 0.25 * sin(uTime * 0.11 + vSeed * 20.0);
        float a = edge * ends * streak * breathe * vA * uIntensity;
        // luz somada: a névoa só apaga o raio (misturar a cor da névoa a somaria)
        #ifdef FOG_EXP2
          a *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        #endif
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });
  mat.uniforms.uTime = globalUniforms.uTime;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;

  const dir = new THREE.Vector3(), m4 = new THREE.Matrix4();
  // sunDir aponta para o sol; o raio desce no sentido oposto. Mais em pé que
  // o sol de verdade quando ele está baixo: raio rente vira só um borrão.
  function setLight(sunDir, color, intensity) {
    dir.copy(sunDir).negate();
    dir.y = Math.min(dir.y, -0.6);
    dir.normalize();
    mat.uniforms.uDir.value.copy(dir);
    mat.uniforms.uColor.value.copy(color);
    mat.uniforms.uIntensity.value = intensity;
    spots.forEach((t, i) => {
      const len = height / -dir.y;
      const y = groundAt(t.x, t.z);
      m4.makeTranslation(t.x - dir.x * len, y + height, t.z - dir.z * len);
      mesh.setMatrixAt(i, m4);
      shaft[i * 4 + 1] = len + 1;
    });
    mesh.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
  }
  return { mesh, setLight };
}
