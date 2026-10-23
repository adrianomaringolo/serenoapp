// Motor comum a todos os ambientes: renderer, câmera, controles de órbita,
// pós-processamento (bloom suave + vinheta e grão), céu, sol, luz ambiente,
// névoa e o laço de animação. O ambiente só monta a cena por cima disto.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { createSky } from './sky.js';
import { globalUniforms } from './materials.js';
import { LightPool } from './lightPool.js';
import { ResolutionGovernor } from './resolution.js';

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 0.7) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      float v = 1.0 - dot(q, q) * 2.2 * uVignette * 2.0;
      c.rgb *= clamp(v, 0.0, 1.0);
      c.rgb += (hash(vUv * 1000.0) - 0.5) * uGrain * (0.3 + c.rgb);
      gl_FragColor = c;
    }`,
};

// Profundidade de campo de lente: o círculo de confusão cresce com
// |1 − foco/distância| (como numa lente de verdade), em pixels. A amostragem é
// um disco em espiral dourada; cada amostra só conta se ela própria estiver
// borrada o bastante para alcançar este pixel (assim o que está em foco não
// "vaza" para o fundo desfocado). Luzes ganham peso extra: o bokeh brilha.
const DofShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uFocus: { value: 5 },
    uAperture: { value: 8 },
    uMaxBlur: { value: 28 },
    uNear: { value: 0.1 },
    uFar: { value: 1200 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float uFocus, uAperture, uMaxBlur, uNear, uFar;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float dist(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    float coc(float d) { return clamp(uAperture * abs(1.0 - uFocus / max(d, 0.01)), 0.0, uMaxBlur); }
    void main() {
      float c0 = coc(dist(vUv));
      vec4 base = texture2D(tDiffuse, vUv);
      if (c0 < 0.5) { gl_FragColor = base; return; }
      vec3 acc = vec3(0.0);
      float wsum = 0.0;
      const int N = 56;
      for (int i = 0; i < N; i++) {
        float r = sqrt((float(i) + 0.5) / float(N));
        float a = float(i) * 2.39996;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * r * c0 / uResolution;
        vec3 c = texture2D(tDiffuse, uv).rgb;
        float cs = coc(dist(uv));
        float w = clamp(cs - r * c0 + 1.0, 0.0, 1.0);
        w *= 1.0 + dot(c, vec3(0.3, 0.6, 0.1)) * 1.5;
        acc += c * w;
        wsum += w;
      }
      gl_FragColor = vec4(wsum > 0.0 ? acc / wsum : base.rgb, base.a);
    }`,
};

export const isTouch = matchMedia('(pointer: coarse)').matches;

export class Engine {
  constructor(container) {
    this.container = container;
    this.quality = isTouch ? 'mobile' : 'desktop';

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    // densidade inicial; a ResolutionGovernor ajusta conforme o aparelho aguenta
    this.maxPixelRatio = Math.min(devicePixelRatio, isTouch ? 1.5 : 1.5);
    renderer.setPixelRatio(this.maxPixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.container = container;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xc88a70, 0.016);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 1200);
    camera.position.set(0, 7.5, 17.5);
    this.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.6, -0.5);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.45;
    controls.zoomSpeed = 0.6;
    controls.panSpeed = 0.5;
    controls.minDistance = 4;
    controls.maxDistance = 26;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minPolarAngle = Math.PI * 0.12;
    controls.autoRotateSpeed = 0.25;
    controls.screenSpacePanning = false;
    this.controls = controls;

    // céu
    this.sky = createSky();
    scene.add(this.sky.mesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    // sol (ou lua) e luz de céu
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.castShadow = true;
    const sm = isTouch ? 1024 : 2048;
    sun.shadow.mapSize.set(sm, sm);
    const sc = sun.shadow.camera;
    sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 120;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    this.sun = sun;
    // distância do sol ao alvo: ambientes com copas altas pedem mais (a copa
    // não pode ficar "atrás" da câmera de sombra)
    this.sunDistance = 50;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
    scene.add(this.hemi);

    // cada luz pontual pesa em todo pixel da cena: poucas, emprestadas às mais próximas
    this.lightPool = new LightPool(scene, isTouch ? 3 : 4);

    // pós-processamento. Sem MSAA: as 4 amostras por pixel num alvo HalfFloat
    // eram o maior custo do quadro (ver scripts/bench.js). O SMAA, depois do
    // tone mapping, suaviza as bordas uma vez só por pixel.
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    const composer = new EffectComposer(renderer, rt);
    // a RenderPass desenha no readBuffer do compositor: com uma DepthTexture
    // nele, o desfoque do modo foto lê a profundidade real da cena (folhas
    // recortadas e vento incluídos), sem renderizar tudo de novo. Os dois alvos
    // têm a sua, porque o compositor os alterna entre quadros (número ímpar de
    // trocas): ler sempre a do renderTarget2 fazia o desfoque, nos quadros
    // trocados, desenhar no alvo cuja profundidade lia — o WebGL recusa esse
    // laço e a tela ficava preta. Ver render().
    composer.renderTarget1.depthTexture = new THREE.DepthTexture(size.x, size.y);
    composer.renderTarget2.depthTexture = new THREE.DepthTexture(size.x, size.y);
    composer.addPass(new RenderPass(scene, camera));
    this.dof = new ShaderPass(DofShader);
    this.dof.enabled = false;
    composer.addPass(this.dof);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.4, 0.55, 0.82);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.smaa = new SMAAPass();
    composer.addPass(this.smaa);
    this.finish = new ShaderPass(FinishShader);
    composer.addPass(this.finish);
    this.composer = composer;

    this.clock = new THREE.Clock();
    this.updaters = new Set();
    this.governor = new ResolutionGovernor(this, { min: 1, max: this.maxPixelRatio });

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    // em retrato, abre o campo de visão para o jardim caber de lado a lado
    this.camera.fov = w / h < 1 ? Math.min(60, 42 / Math.pow(w / h, 0.5)) : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    // pontos (vaga-lumes, fumaça) têm tamanho em pixels do buffer: acompanha a densidade
    globalUniforms.uPointScale.value = buf.y / 2;
    if (this.dof) this.dof.uniforms.uResolution.value.copy(buf);
    if (this.resizers) {
      const size = buf;
      for (const fn of this.resizers) fn(size.x, size.y);
    }
  }

  // fn(larguraEmPixels, alturaEmPixels) a cada mudança de tamanho ou densidade
  onResize(fn) {
    this.resizers = this.resizers || new Set();
    this.resizers.add(fn);
  }

  setPixelRatio(pr) {
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.resize();
  }

  // Aplica o estado do momento do dia em tudo que é do motor.
  applyTime(s) {
    this.applySky(s);
    this.sun.color.copy(s.sunColor);
    this.sun.intensity = s.sunIntensity;
    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;
    this.scene.fog.color.copy(s.fogColor);
    this.scene.fog.density = s.fogDensity;
    this.scene.environmentIntensity = s.envIntensity;
    this.renderer.toneMappingExposure = s.exposure * Math.pow(2, this.exposureBias || 0);
    this.bloom.strength = s.bloom;
  }

  applySky(s) {
    const u = this.sky.uniforms;
    u.uZenith.value.copy(s.zenith);
    u.uHorizon.value.copy(s.horizon);
    u.uGround.value.copy(s.ground);
    u.uSunDir.value.copy(s.sunDir);
    u.uSunColor.value.copy(s.sunColor);
    u.uSunSize.value = s.sunSize;
    u.uGlow.value = s.glow;
    u.uStars.value = s.stars;
    u.uClouds.value = s.clouds;
    u.uCloudColor.value.copy(s.cloudColor);
    u.uCloudShadow.value.copy(s.cloudShadow);
  }

  // Mapas de ambiente (a luz do céu refletida nos materiais), um por momento
  // do dia, gerados no carregamento. Gerar um custa ~300 ms de GPU de uma vez:
  // fazer isso durante a transição era o engasgo ao trocar o horário.
  prepareEnvironments(timeOfDay) {
    this.envMaps = {};
    for (const [name, preset] of Object.entries(timeOfDay.presets)) {
      this.applySky(preset);
      this.envMaps[name] = this.pmrem.fromScene(this.sky.envScene, 0, 0.1, 1000, { size: 128 });
    }
    // uma textura "viva" fixa na cena: trocar o objeto da textura faria o
    // three reconfigurar todos os materiais; copiar o conteúdo é só um blit
    this.applySky(timeOfDay.current);
    this.envLive = this.pmrem.fromScene(this.sky.envScene, 0, 0.1, 1000, { size: 128 });
    this.scene.environment = this.envLive.texture;
    this.envKey = null;
    this.updateEnvironment(timeOfDay);
  }

  // Na transição, troca de mapa no meio do caminho; a intensidade já é interpolada.
  updateEnvironment(tod) {
    if (!this.envMaps) return;
    const key = tod.transitioning && tod.t < 0.5 && tod.fromName ? tod.fromName : tod.name;
    if (key === this.envKey || !this.envMaps[key]) return;
    this.envKey = key;
    this.renderer.copyTextureToTexture(this.envMaps[key].texture, this.envLive.texture);
  }

  onUpdate(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  // Voo suave da câmera (modo órbita) até uma nova posição e alvo.
  flyTo(position, target, duration = 2.4) {
    this.flight = {
      fromP: this.camera.position.clone(), fromT: this.controls.target.clone(),
      toP: position.clone(), toT: target.clone(), t: 0, dur: duration,
    };
  }

  updateFlight(real) {
    const f = this.flight;
    if (!f || this.freeCamera) return;
    f.t = Math.min(1, f.t + real / f.dur);
    const k = f.t < 0.5 ? 4 * f.t * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 3) / 2; // easeInOutCubic
    this.camera.position.lerpVectors(f.fromP, f.toP, k);
    // um arco suave para cima no meio do voo (não atravessa árvores tão fácil)
    this.camera.position.y += Math.sin(Math.PI * k) * Math.min(3, f.fromP.distanceTo(f.toP) * 0.12);
    this.controls.target.lerpVectors(f.fromT, f.toT, k);
    if (f.t >= 1) this.flight = null;
  }

  // fn(dtReal) — roda mesmo com o tempo pausado (ex.: câmera do modo foto)
  onRealUpdate(fn) {
    this.realUpdaters = this.realUpdaters || new Set();
    this.realUpdaters.add(fn);
    return () => this.realUpdaters.delete(fn);
  }

  // Tira uma foto: renderiza um quadro em alta resolução (sem interface) e
  // devolve { blob, thumb, width, height }.
  capture({ type = 'image/jpeg', quality = 0.93, longSide = 3840, thumbSize = 480 } = {}) {
    return new Promise((resolve) => { this.pendingCapture = { type, quality, longSide, thumbSize, resolve }; });
  }

  // o desfoque lê a profundidade do alvo onde a cena vai ser desenhada agora
  render(dt) {
    this.dof.uniforms.tDepth.value = this.composer.readBuffer.depthTexture;
    this.composer.render(dt);
  }

  doCapture(job, dt) {
    const r = this.renderer;
    const prev = r.getPixelRatio();
    const gov = this.governor.enabled;
    this.governor.enabled = false;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const pr = Math.min(job.longSide / Math.max(w, h), 4);
    this.setPixelRatio(pr);
    this.render(dt);
    // copia para um canvas 2D na mesma tarefa: o buffer WebGL é limpo depois
    const src = r.domElement;
    const full = document.createElement('canvas');
    full.width = src.width; full.height = src.height;
    full.getContext('2d').drawImage(src, 0, 0);
    const k = job.thumbSize / Math.max(full.width, full.height);
    const thumb = document.createElement('canvas');
    thumb.width = Math.round(full.width * k); thumb.height = Math.round(full.height * k);
    const tctx = thumb.getContext('2d');
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(full, 0, 0, thumb.width, thumb.height);
    this.setPixelRatio(prev);
    this.governor.enabled = gov;
    full.toBlob((blob) => {
      thumb.toBlob((tb) => job.resolve({ blob, thumb: tb, width: full.width, height: full.height }), 'image/jpeg', 0.85);
    }, job.type, job.quality);
  }

  start() {
    this.time = 0;
    this.timeScale = 1;
    const loop = () => {
      const real = Math.min(this.clock.getDelta(), 0.05);
      const dt = real * this.timeScale;
      this.time += dt;
      const t = this.time;
      globalUniforms.uTime.value = t;
      this.finish.uniforms.uTime.value = this.clock.elapsedTime;

      for (const fn of this.updaters) fn(dt, t);
      if (this.realUpdaters) for (const fn of this.realUpdaters) fn(real);
      this.updateFlight(real);
      if (!this.freeCamera) this.controls.update(real);

      // o sol acompanha o alvo da câmera para a sombra ficar nítida onde se olha
      const tgt = this.freeCamera ? this.freeCamera.focusPoint : this.controls.target;
      this.sun.target.position.set(tgt.x, 0, tgt.z);
      this.sun.position.copy(this.sun.target.position).addScaledVector(this.sky.uniforms.uSunDir.value, this.sunDistance);
      if (this.sun.position.y < 4) this.sun.position.y = 4; // sol rente: evita sombra infinita
      this.sky.mesh.position.copy(this.camera.position);

      if (this.timeOfDay) this.updateEnvironment(this.timeOfDay);

      this.lightPool.update(this.camera, t);
      if (this.pendingCapture) {
        const job = this.pendingCapture;
        this.pendingCapture = null;
        this.doCapture(job, dt);
      }
      this.render(dt);
      this.governor.frame(performance.now());
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }
}
