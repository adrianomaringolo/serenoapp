// Ponto de vista: órbita (padrão), caminhar e pontos de vista prontos.
//  - Órbita: dois cliques (ou dois toques) em qualquer lugar levam a câmera
//    até ali, que passa a girar em volta desse ponto.
//  - Caminhar: na altura dos olhos, seguindo o chão (ver core/walkCamera.js).
//  - Pontos de vista: lugares escolhidos de cada ambiente; em órbita a câmera
//    voa até eles, caminhando você é levado até lá.
import * as THREE from 'three';
import { WalkCamera } from '../core/walkCamera.js';
import { ViewMarkers } from './viewMarkers.js';

export class ViewMode {
  constructor({ engine, env, audio, hud, interaction }) {
    Object.assign(this, { engine, env, audio, hud, interaction });
    this.walking = false;
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    this.walker = new WalkCamera(engine, {
      // null do ambiente quer dizer "não pode pisar aqui" (não usar ?? — ele trocaria o null pelo padrão)
      standAt: env.standAt ? (x, z) => env.standAt(x, z) : (x, z) => ({ y: env.surfaceHeight(x, z, 'ground'), kind: 'grass' }),
      pick: (ray) => env.pickSurface(ray),
      onStep: (kind) => audio.step?.(kind),
    });
    engine.onRealUpdate((dt) => this.walker.update(dt));

    // marcadores no cenário: clicar leva até o lugar
    this.markers = new ViewMarkers({ engine, env, onPick: (vp) => { this.goTo(vp); this.hud.hint(vp.name, 2500); } });
    interaction.clickFirst = (e) => this.markers.handleClick(e);
    this.walker.clickFirst = (e) => this.markers.handleClick(e);
    let showMarkers = true;
    try { showMarkers = localStorage.getItem('sereno:marcadores') !== '0'; } catch { /* sem storage */ }
    const tg = $('view-markers');
    const syncM = () => { this.markers.setVisible(showMarkers); tg.classList.toggle('on', showMarkers); tg.textContent = showMarkers ? 'Marcadores no cenário: sim' : 'Marcadores no cenário: não'; };
    tg.addEventListener('click', () => { showMarkers = !showMarkers; try { localStorage.setItem('sereno:marcadores', showMarkers ? '1' : '0'); } catch { /* sem storage */ } syncM(); });
    syncM();

    // painel
    $('view-orbit').addEventListener('click', () => this.setWalking(false));
    $('view-walk').addEventListener('click', () => this.setWalking(true));
    $('walk-exit').addEventListener('click', () => this.setWalking(false));
    const list = $('view-points');
    for (const vp of env.viewpoints || []) {
      const b = document.createElement('button');
      b.className = 'text-btn';
      b.textContent = vp.name;
      b.addEventListener('click', () => { this.goTo(vp); $('pop-view').hidden = true; });
      list.appendChild(b);
    }
    this.sync();

    // dois cliques/toques: recentralizar a órbita naquele ponto
    const canvas = engine.renderer.domElement;
    canvas.addEventListener('dblclick', (e) => this.recenter(e));
    let lastTap = null;
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      const now = performance.now();
      if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        this.recenter(e);
        lastTap = null;
      } else lastTap = { t: now, x: e.clientX, y: e.clientY };
    });

    addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, select, textarea')) return;
      if (this.hud.photo?.active || this.hud.gallery?.isOpen) return;
      if (this.walking && e.key === 'Escape') this.setWalking(false);
      else if (e.key === 'c' || e.key === 'C') this.setWalking(!this.walking);
    });
  }

  sync() {
    this.$('view-orbit').classList.toggle('on', !this.walking);
    this.$('view-walk').classList.toggle('on', this.walking);
    this.$('walk-bar').hidden = !this.walking;
    document.body.classList.toggle('walking', this.walking);
  }

  setWalking(on, start) {
    if (on === this.walking && !start) return;
    const e = this.engine;
    if (on) {
      e.flight = null;
      this.interaction.select(null);
      this.interaction.cancelPlacing?.();
      this.hud.breathing?.stop?.();
      e.controls.enabled = false;
      e.freeCamera = this.walker;
      // começa onde a câmera está olhando (o ponto da órbita), virado para frente
      const t = start || (() => {
        const tg = e.controls.target, cp = e.camera.position;
        return { x: tg.x + (cp.x - tg.x) * 0.25, z: tg.z + (cp.z - tg.z) * 0.25, yaw: Math.atan2(cp.x - tg.x, cp.z - tg.z) };
      })();
      this.walker.enable();
      if (!this.walker.placeAt(t.x, t.z, t.yaw)) {
        const s = this.env.walkStart;
        this.walker.placeAt(s.x, s.z, s.yaw);
      }
      e.camera.fov = 55; // mais aberto, como os olhos
      e.camera.updateProjectionMatrix();
      this.walking = true;
      this.hud.hint('Arraste para olhar · WASD ou toque no chão para andar · Esc volta', 5000);
    } else if (this.walking) {
      this.walker.disable();
      e.freeCamera = null;
      // a órbita passa a girar em volta de um ponto à frente de quem caminhava
      const look = new THREE.Vector3(0, 0, -1).applyQuaternion(e.camera.quaternion);
      look.y = 0; look.normalize();
      const tgt = e.camera.position.clone().addScaledVector(look, 6);
      tgt.y = Math.max(this.env.surfaceHeight(tgt.x, tgt.z, 'ground'), 0) + 0.8;
      e.controls.target.copy(tgt);
      // recua um pouco e sobe, para a órbita não começar com o nariz no chão
      const back = e.camera.position.clone().addScaledVector(look, -3);
      back.y += 2.5;
      e.camera.position.copy(back);
      e.controls.enabled = true;
      e.resize();
      this.walking = false;
    }
    this.sync();
  }

  goTo(vp) {
    if (this.walking) {
      const yaw = Math.atan2(vp.position.x - vp.target.x, vp.position.z - vp.target.z);
      this.walker.placeAt(vp.position.x, vp.position.z, yaw);
      this.walker.pitch = -0.1;
      this.audio.lift?.();
    } else {
      this.engine.flyTo(vp.position, vp.target, 3);
    }
  }

  recenter(e) {
    if (this.walking || this.engine.freeCamera || this.interaction.placing) return;
    if (this.interaction.pickItem(e)) return; // dois cliques num objeto não mudam a vista
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.engine.camera);
    const hit = this.env.pickSurface(ray.ray);
    if (!hit) return;
    const c = this.engine.controls;
    const target = hit.p.clone().add(new THREE.Vector3(0, 0.6, 0));
    // mantém a direção de onde se olha, mas chega mais perto (entre 6 e 11 m)
    const dir = this.engine.camera.position.clone().sub(c.target);
    const dist = THREE.MathUtils.clamp(dir.length() * 0.6, 6, 11);
    dir.setLength(dist);
    const pos = target.clone().add(dir);
    pos.y = Math.max(pos.y, this.env.surfaceHeight(pos.x, pos.z, 'ground') + 1.5);
    this.engine.flyTo(pos, target, 2.2);
  }
}
