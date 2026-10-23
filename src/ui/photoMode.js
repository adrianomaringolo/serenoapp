// Modo foto: câmera livre, lente, foco (toque para focar), abertura,
// exposição, horizonte, grade de terços, tempo pausado e horário do dia.
// O obturador renderiza a foto em alta resolução e a guarda na galeria local.
import * as THREE from 'three';
import { FreeCamera } from '../core/freeCamera.js';
import { addPhoto } from '../core/photoStore.js';

const F_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
const LENS_MIN = 14, LENS_MAX = 200;
const FOCUS_MIN = 0.3, FOCUS_MAX = 200;
// slider 0..1000 ↔ valor em escala logarítmica
const toLog = (v, a, b) => Math.round((Math.log(v / a) / Math.log(b / a)) * 1000);
const fromLog = (s, a, b) => a * Math.pow(b / a, s / 1000);
// lente (mm, sensor full-frame) → campo de visão vertical (graus)
const fovFromLens = (mm) => THREE.MathUtils.radToDeg(2 * Math.atan(12 / mm));

export class PhotoMode {
  constructor({ engine, env, tod, audio, hud, interaction, breathing, gallery, envName }) {
    Object.assign(this, { engine, env, tod, audio, hud, interaction, breathing, gallery, envName });
    this.active = false;
    this.s = { lens: 35, focus: 6, fIndex: 2, ev: 0, roll: 0, grid: false, paused: false };
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    this.root = $('photo');
    this.cam = new FreeCamera(engine, {
      groundAt: (x, z) => env.surfaceHeight(x, z, 'ground'),
      onTap: (e) => this.focusAt(e),
    });
    this.unsub = engine.onRealUpdate((dt) => this.cam.update(dt));
    engine.onResize(() => { if (this.active) this.applyLens(); });

    // controles
    const bind = (id, fn) => $(id).addEventListener('input', (e) => { fn(+e.target.value); this.syncLabels(); });
    bind('ph-lens', (v) => { this.s.lens = fromLog(v, LENS_MIN, LENS_MAX); this.applyLens(); });
    bind('ph-focus', (v) => { this.s.focus = fromLog(v, FOCUS_MIN, FOCUS_MAX); this.applyFocus(); });
    bind('ph-fstop', (v) => { this.s.fIndex = v; this.applyFocus(); });
    bind('ph-ev', (v) => { this.s.ev = v; this.applyExposure(); });
    bind('ph-roll', (v) => { this.s.roll = v; this.cam.roll = THREE.MathUtils.degToRad(-v); });
    $('ph-grid').addEventListener('click', () => { this.s.grid = !this.s.grid; this.syncToggles(); });
    $('ph-pause').addEventListener('click', () => { this.s.paused = !this.s.paused; this.engine.timeScale = this.s.paused ? 0 : 1; this.syncToggles(); });
    $('ph-panel-toggle').addEventListener('click', () => this.root.classList.toggle('collapsed'));
    $('ph-exit').addEventListener('click', () => this.exit());
    $('ph-shutter').addEventListener('click', () => this.shoot());
    $('ph-gallery').addEventListener('click', () => this.gallery.open());
    const times = $('ph-times');
    for (const name of Object.keys(tod.presets)) {
      const b = document.createElement('button');
      b.className = 'ph-chip';
      b.dataset.time = name;
      b.textContent = tod.presets[name].label;
      b.addEventListener('click', () => { tod.set(name, 4); this.syncToggles(); hud.updateTimeLabel(); });
      times.appendChild(b);
    }
    // a interface do modo foto não deixa o arrasto chegar à câmera
    this.root.querySelectorAll('.ph-panel, .ph-top, .ph-bottom').forEach((el) => el.addEventListener('pointerdown', (e) => e.stopPropagation()));

    addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, select, textarea')) return;
      if (this.gallery.isOpen) return;
      if (!this.active) return;
      if (e.key === 'Escape') this.exit();
      else if (e.key === 'Enter' || e.key === 'p' || e.key === 'P') this.shoot();
      else if (e.key === 'g' || e.key === 'G') { this.s.grid = !this.s.grid; this.syncToggles(); }
    });
  }

  toggle() {
    this.active ? this.exit() : this.enter();
  }

  enter() {
    if (this.active) return;
    this.active = true;
    const e = this.engine;
    this.saved = { pos: e.camera.position.clone(), quat: e.camera.quaternion.clone(), target: e.controls.target.clone() };
    this.breathing.stop();
    this.interaction.select(null);
    this.interaction.cancelPlacing?.();
    this.hud.root.classList.add('hidden');
    e.controls.enabled = false;
    e.controls.autoRotate = false;
    e.freeCamera = this.cam;
    this.cam.isPhoto = true;
    this.cam.enable();
    this.cam.roll = THREE.MathUtils.degToRad(-this.s.roll);
    e.dof.enabled = true;
    // começa com o foco no que está no meio da tela
    this.focusAt({ clientX: innerWidth / 2, clientY: innerHeight / 2 }, false);
    this.applyLens();
    this.applyFocus();
    this.applyExposure();
    this.root.hidden = false;
    this.syncLabels();
    this.syncToggles();
    this.hint('Arraste para olhar · WASD anda · Q/E desce e sobe · toque para focar');
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    const e = this.engine;
    this.cam.disable();
    e.freeCamera = null;
    e.dof.enabled = false;
    e.timeScale = 1;
    this.s.paused = false;
    e.exposureBias = 0;
    e.applyTime(this.tod.current);
    e.camera.position.copy(this.saved.pos);
    e.camera.quaternion.copy(this.saved.quat);
    e.controls.target.copy(this.saved.target);
    e.controls.enabled = true;
    e.resize(); // volta o campo de visão normal
    this.root.hidden = true;
    this.hud.root.classList.remove('hidden');
  }

  applyLens() {
    const c = this.engine.camera;
    c.fov = fovFromLens(this.s.lens);
    c.updateProjectionMatrix();
    this.applyFocus();
  }

  // círculo de confusão em pixels: cresce com (focal²) / (f-stop × distância de foco)
  applyFocus() {
    const u = this.engine.dof.uniforms;
    const f = F_STOPS[this.s.fIndex];
    const h = this.engine.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    u.uFocus.value = this.s.focus;
    u.uAperture.value = (this.s.lens * this.s.lens) / (f * Math.max(this.s.focus, 0.3)) * 0.012 * (h / 900);
    u.uMaxBlur.value = 30 * (h / 900);
    u.uNear.value = this.engine.camera.near;
    u.uFar.value = this.engine.camera.far;
  }

  applyExposure() {
    this.engine.exposureBias = this.s.ev;
    this.engine.applyTime(this.tod.current);
  }

  focusAt(e, animate = true) {
    const eng = this.engine;
    const r = eng.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, eng.camera);
    let point = null;
    const hits = ray.intersectObjects(eng.scene.children, true);
    for (const h of hits) {
      const o = h.object;
      if (o === eng.sky.mesh || o.isSprite || o.isPoints || !o.visible || o.material?.blending === THREE.AdditiveBlending) continue;
      point = h.point;
      break;
    }
    if (!point) {
      const hit = this.env.pickSurface(ray.ray);
      point = hit?.p;
    }
    // distância ao longo do eixo da câmera (é o que o desfoque usa)
    const d = point ? -point.clone().applyMatrix4(eng.camera.matrixWorldInverse).z : 50;
    this.s.focus = THREE.MathUtils.clamp(d, FOCUS_MIN, FOCUS_MAX);
    this.applyFocus();
    this.syncLabels();
    if (animate) {
      const ret = this.$('ph-reticle');
      ret.style.left = `${e.clientX}px`;
      ret.style.top = `${e.clientY}px`;
      ret.classList.remove('show');
      void ret.offsetWidth;
      ret.classList.add('show');
      this.audio.focusBeep?.();
    }
  }

  async shoot() {
    if (this.busy) return;
    this.busy = true;
    const flash = this.$('ph-flash');
    this.audio.shutter?.();
    const shot = await this.engine.capture({});
    flash.classList.remove('go');
    void flash.offsetWidth;
    flash.classList.add('go');
    const preset = this.tod.presets[this.tod.name];
    await addPhoto({
      ...shot, envId: this.env.id, envName: this.env.name, time: this.tod.name, timeLabel: preset?.label,
      lens: Math.round(this.s.lens), fStop: F_STOPS[this.s.fIndex],
    });
    // miniatura voa para o botão da galeria
    const url = URL.createObjectURL(shot.thumb);
    const btn = this.$('ph-gallery');
    btn.style.backgroundImage = `url(${url})`;
    btn.classList.add('has');
    if (this.lastThumb) URL.revokeObjectURL(this.lastThumb);
    this.lastThumb = url;
    this.hint('Foto guardada na galeria');
    this.busy = false;
  }

  syncLabels() {
    const s = this.s;
    const $ = this.$;
    $('ph-lens').value = toLog(s.lens, LENS_MIN, LENS_MAX);
    $('ph-focus').value = toLog(s.focus, FOCUS_MIN, FOCUS_MAX);
    $('ph-fstop').value = s.fIndex;
    $('ph-ev').value = s.ev;
    $('ph-roll').value = s.roll;
    $('ph-lens-v').textContent = `${Math.round(s.lens)} mm`;
    $('ph-focus-v').textContent = s.focus < 10 ? `${s.focus.toFixed(1)} m` : `${Math.round(s.focus)} m`;
    $('ph-fstop-v').textContent = `f/${F_STOPS[s.fIndex]}`;
    $('ph-ev-v').textContent = `${s.ev > 0 ? '+' : ''}${(+s.ev).toFixed(1)} EV`;
    $('ph-roll-v').textContent = `${s.roll}°`;
  }

  syncToggles() {
    this.$('ph-grid').classList.toggle('on', this.s.grid);
    this.$('ph-pause').classList.toggle('on', this.s.paused);
    this.$('ph-grid-overlay').hidden = !this.s.grid;
    this.root.querySelectorAll('.ph-chip').forEach((b) => b.classList.toggle('on', b.dataset.time === this.tod.name));
  }

  hint(text) {
    const el = this.$('ph-hint');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => el.classList.remove('show'), 3500);
  }
}
