// Câmera livre do modo foto. Mouse: arrastar olha; WASD/setas andam; Q/E (ou
// Ctrl/Espaço) descem e sobem; Shift acelera; rodinha avança e recua.
// Toque: um dedo olha, dois dedos deslizam (andar de lado/subir), pinça avança.
// Movimento com inércia suave, nunca atravessa o chão nem a água.
import * as THREE from 'three';

const CLICK_PX = 6;

export class FreeCamera {
  constructor(engine, { groundAt, onTap } = {}) {
    this.engine = engine;
    this.camera = engine.camera;
    this.groundAt = groundAt || (() => 0);
    this.onTap = onTap || (() => {});
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.pointers = new Map();
    this.focusPoint = new THREE.Vector3();
    this.active = false;
    this.wheelPush = 0;
    this.touchMove = new THREE.Vector3();
    const el = engine.renderer.domElement;
    this.el = el;
    this.h = {
      down: (e) => this.down(e), move: (e) => this.move(e), up: (e) => this.up(e),
      wheel: (e) => this.wheel(e), kd: (e) => this.keydown(e), ku: (e) => this.keys.delete(e.code),
      blur: () => this.keys.clear(),
    };
  }

  enable() {
    const q = this.camera.quaternion;
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    this.yaw = e.y; this.pitch = e.x; this.roll = 0;
    this.vel.set(0, 0, 0);
    this.active = true;
    const el = this.el;
    el.addEventListener('pointerdown', this.h.down);
    addEventListener('pointermove', this.h.move);
    addEventListener('pointerup', this.h.up);
    addEventListener('pointercancel', this.h.up);
    el.addEventListener('wheel', this.h.wheel, { passive: false });
    addEventListener('keydown', this.h.kd);
    addEventListener('keyup', this.h.ku);
    addEventListener('blur', this.h.blur);
    el.style.cursor = 'grab';
  }

  disable() {
    this.active = false;
    const el = this.el;
    el.removeEventListener('pointerdown', this.h.down);
    removeEventListener('pointermove', this.h.move);
    removeEventListener('pointerup', this.h.up);
    removeEventListener('pointercancel', this.h.up);
    el.removeEventListener('wheel', this.h.wheel);
    removeEventListener('keydown', this.h.kd);
    removeEventListener('keyup', this.h.ku);
    removeEventListener('blur', this.h.blur);
    this.keys.clear();
    this.pointers.clear();
    el.style.cursor = '';
  }

  // sensibilidade do olhar acompanha o zoom (teleobjetiva = movimento fino)
  get lookK() { return 0.0032 * (this.camera.fov / 50); }

  down(e) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ponteiro sintético */ }
    this.el.style.cursor = 'grabbing';
    if (this.pointers.size === 2) this.pinch = this.pinchState();
  }

  pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this.pointers.size === 1) {
      this.yaw -= dx * this.lookK;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * this.lookK, -1.45, 1.45);
    } else if (this.pointers.size === 2) {
      const s = this.pinchState();
      // pinça: avançar/recuar; arrasto com dois dedos: lado e altura
      this.touchMove.z += (s.d - this.pinch.d) * 0.012;
      this.touchMove.x -= (s.mx - this.pinch.mx) * 0.006;
      this.touchMove.y += (s.my - this.pinch.my) * 0.006;
      this.pinch = s;
    }
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!this.pointers.size) this.el.style.cursor = 'grab';
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < CLICK_PX && e.type === 'pointerup') this.onTap(e);
  }

  wheel(e) {
    e.preventDefault();
    this.wheelPush -= Math.sign(e.deltaY) * 0.6;
  }

  keydown(e) {
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    this.keys.add(e.code);
  }

  update(dt) {
    if (!this.active) return;
    const k = this.keys;
    const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? 3.5 : 1;
    const speed = 1.6 * fast;
    const want = new THREE.Vector3(
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      (k.has('KeyE') || k.has('Space') ? 1 : 0) - (k.has('KeyQ') || k.has('ControlLeft') ? 1 : 0),
      (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0),
    ).multiplyScalar(speed);
    want.z += this.wheelPush * 2;
    this.wheelPush *= Math.pow(0.02, dt);
    if (Math.abs(this.wheelPush) < 0.01) this.wheelPush = 0;

    // direções no plano (andar não depende de olhar para cima ou para baixo)
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const target = new THREE.Vector3()
      .addScaledVector(right, want.x)
      .addScaledVector(fwd, want.z)
      .add(new THREE.Vector3(0, want.y, 0));
    this.vel.lerp(target, 1 - Math.exp(-dt * 5));
    const cam = this.camera;
    cam.position.addScaledVector(this.vel, dt);
    // gestos de toque deslocam direto (já vêm suavizados pelo dedo)
    if (this.touchMove.lengthSq()) {
      cam.position.addScaledVector(fwd, this.touchMove.z).addScaledVector(right, this.touchMove.x);
      cam.position.y += this.touchMove.y;
      this.touchMove.set(0, 0, 0);
    }
    // limites: acima do chão/água e dentro do mundo
    const floor = this.groundAt(cam.position.x, cam.position.z) + 0.12;
    if (cam.position.y < floor) { cam.position.y = floor; this.vel.y = Math.max(this.vel.y, 0); }
    cam.position.y = Math.min(cam.position.y, 40);
    const r = Math.hypot(cam.position.x, cam.position.z);
    if (r > 70) cam.position.multiplyScalar(70 / r);

    cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.focusPoint.copy(cam.position).addScaledVector(look, 10);
  }
}
