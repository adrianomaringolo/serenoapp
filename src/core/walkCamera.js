// Caminhar pelo cenário na altura dos olhos. Herda da câmera livre o olhar
// (arrastar) e o teclado; muda o resto:
//  - anda só no plano, seguindo o chão (terreno, deck, passarela, pavilhão);
//  - não entra onde o ambiente não deixa (água, areia rastelada, fora do mapa):
//    desliza ao longo do obstáculo em vez de travar;
//  - tocar no chão faz caminhar até ali;
//  - passos: leve balanço da cabeça e som conforme o piso.
import * as THREE from 'three';
import { FreeCamera } from './freeCamera.js';

export class WalkCamera extends FreeCamera {
  // standAt(x, z) → { y, kind } ou null (não dá para ficar ali)
  constructor(engine, { standAt, pick, onStep, eye = 1.55 } = {}) {
    super(engine, { groundAt: () => 0, onTap: (e) => this.tapTo(e) });
    this.standAt = standAt;
    this.pick = pick;
    this.onStep = onStep || (() => {});
    this.eye = eye;
    this.walkTo = null;
    this.stride = 0;
    this.bob = 0;
    this.headY = null;
    this.raycaster = new THREE.Raycaster();
  }

  enable(start) {
    super.enable();
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.6, 0.4);
    if (start) this.placeAt(start.x, start.z, start.yaw);
    this.walkTo = null;
  }

  // coloca a pessoa num ponto válido (ou no mais próximo dele, em espiral)
  placeAt(x, z, yaw) {
    let spot = null;
    for (let r = 0; r < 12 && !spot; r += 0.5) {
      for (let a = 0; a < Math.PI * 2 && !spot; a += Math.PI / 8) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        const s = this.standAt(px, pz);
        if (s) spot = { x: px, z: pz, y: s.y };
        if (r === 0) break;
      }
    }
    if (!spot) return false;
    this.camera.position.set(spot.x, spot.y + this.eye, spot.z);
    this.headY = spot.y + this.eye;
    if (yaw != null) this.yaw = yaw;
    this.vel.set(0, 0, 0);
    return true;
  }

  tapTo(e) {
    if (this.clickFirst?.(e)) return;
    const r = this.el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.pick(this.raycaster.ray);
    if (hit && this.standAt(hit.p.x, hit.p.z)) this.walkTo = hit.p.clone();
  }

  wheel(e) {
    e.preventDefault();
    // rodinha: alguns passos para frente/para trás
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.walkTo = this.camera.position.clone().addScaledVector(f, -Math.sign(e.deltaY) * 1.5);
  }

  update(dt) {
    if (!this.active) return;
    const k = this.keys;
    const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? 2.2 : 1;
    const speed = 1.25 * fast; // passo de passeio, sem pressa
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let mz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = new THREE.Vector3().addScaledVector(right, mx).addScaledVector(fwd, mz);
    if (mx || mz) this.walkTo = null;
    const cam = this.camera;
    if (this.walkTo) {
      const d = new THREE.Vector3(this.walkTo.x - cam.position.x, 0, this.walkTo.z - cam.position.z);
      const dist = d.length();
      if (dist < 0.25) this.walkTo = null;
      else {
        want.copy(d.normalize()).multiplyScalar(Math.min(1, dist / 0.8));
        // vira o olhar devagar na direção do caminho
        const targetYaw = Math.atan2(-d.x, -d.z);
        let dy = targetYaw - this.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        if (!this.pointers.size) this.yaw += dy * Math.min(1, dt * 2);
      }
    }
    // gestos de toque (dois dedos) também andam
    if (this.touchMove.lengthSq()) {
      want.addScaledVector(fwd, this.touchMove.z * 4).addScaledVector(right, this.touchMove.x * 4);
      this.touchMove.set(0, 0, 0);
    }
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(speed);
    this.vel.lerp(want, 1 - Math.exp(-dt * 6));

    // move, deslizando ao longo do que não pode ser pisado
    const step = this.vel.clone().multiplyScalar(dt);
    let nx = cam.position.x + step.x, nz = cam.position.z + step.z;
    let here = this.standAt(nx, nz);
    if (!here) {
      if ((here = this.standAt(nx, cam.position.z))) nz = cam.position.z;
      else if ((here = this.standAt(cam.position.x, nz))) nx = cam.position.x;
      else { nx = cam.position.x; nz = cam.position.z; here = this.standAt(nx, nz); this.vel.multiplyScalar(0.3); this.walkTo = null; }
    }
    const moved = Math.hypot(nx - cam.position.x, nz - cam.position.z);
    cam.position.x = nx;
    cam.position.z = nz;

    // passos: balanço da cabeça e som a cada ~0,7 m
    if (moved > 0.0005) {
      this.stride += moved;
      this.bob += moved * 4.5;
      if (this.stride > 0.72) { this.stride = 0; this.onStep(here?.kind || 'grass'); }
    }
    const bobY = Math.sin(this.bob * 2) * 0.025 * Math.min(1, this.vel.length() / 1.2);
    const groundY = (here ? here.y : 0) + this.eye;
    this.headY = this.headY == null ? groundY : this.headY + (groundY - this.headY) * (1 - Math.exp(-dt * 10));
    cam.position.y = this.headY + bobY;

    cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.focusPoint.copy(cam.position).addScaledVector(look, 10);
  }
}
