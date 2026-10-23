// Interação com o cenário:
//  - mover: arrastar um objeto (ele sobe um pouco, segue o dedo, assenta com som)
//  - rastelar: desenhar sulcos na areia
//  - colocar: um objeto novo segue o ponteiro até o clique/toque que o assenta
//  - tocar a água faz ondas (e as carpas vêm ver); tocar o bambu o faz virar
// Arrastar no vazio continua girando a câmera (OrbitControls).
import * as THREE from 'three';

const CLICK_PX = 7;
const DOWN = new THREE.Vector3(0, -1, 0);

export class Interaction {
  constructor({ engine, env, items, audio, onChange, onSelect }) {
    this.engine = engine;
    this.env = env;
    this.items = items;
    this.audio = audio;
    this.onChange = onChange || (() => {});
    this.onSelect = onSelect || (() => {});
    this.mode = 'move';
    this.placing = null;
    this.selected = null;
    this.drag = null;
    this.raking = false;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.pointers = new Map();

    // anel suave no chão marcando o objeto selecionado
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0, depthWrite: false }),
    );
    ring.renderOrder = 4;
    engine.scene.add(ring);
    this.ring = ring;

    const el = engine.container;
    el.addEventListener('pointerdown', (e) => this.down(e), true);
    el.addEventListener('pointermove', (e) => this.move(e), true);
    addEventListener('pointerup', (e) => this.up(e), true);
    addEventListener('pointercancel', (e) => this.up(e, true), true);
    el.addEventListener('wheel', (e) => this.wheel(e), { capture: true, passive: false });
    addEventListener('keydown', (e) => this.key(e));
  }

  setMode(mode) {
    if (this.placing) this.cancelPlacing();
    this.mode = mode;
    if (mode !== 'move') this.select(null);
    this.engine.container.style.cursor = mode === 'rake' ? 'crosshair' : '';
  }

  // --- utilidades --------------------------------------------------------------
  rayFrom(e) {
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.engine.camera);
    return this.raycaster.ray;
  }

  pickItem(e) {
    this.rayFrom(e);
    const hits = this.raycaster.intersectObject(this.items.root, true);
    for (const h of hits) {
      const it = h.object.userData.item;
      if (it && !it.removing && it !== this.placing) return { item: it, point: h.point };
    }
    return null;
  }

  pickClickable(e) {
    this.rayFrom(e);
    for (const c of this.env.clickables || []) {
      if (this.raycaster.intersectObject(c.object, true).length) return c;
    }
    return null;
  }

  select(item) {
    if (this.selected === item) return;
    this.selected = item;
    this.onSelect(item);
  }

  // --- colocar objeto novo -------------------------------------------------------
  startPlacing(type) {
    this.setMode('move');
    const can = this.items.canAdd(type);
    if (!can.ok) {
      this.onLimit?.(can.reason);
      return false;
    }
    const it = this.items.add(type, { x: 0, z: 0, pop: true });
    if (!it) return;
    it.object.visible = false;
    it.lift = 0.4;
    this.placing = it;
    this.select(null);
    this.engine.container.style.cursor = 'copy';
  }

  cancelPlacing() {
    if (!this.placing) return;
    this.items.remove(this.placing);
    this.placing = null;
    this.engine.container.style.cursor = '';
  }

  followPlacing(e) {
    const it = this.placing;
    const hit = this.env.pickSurface(this.rayFrom(e));
    const ok = this.env.accepts(hit, it.def);
    if (!ok) {
      it.object.visible = false;
      return false;
    }
    const first = !it.object.visible;
    it.object.visible = true;
    it.target.set(hit.p.x, this.items.surfaceHeight(hit.p.x, hit.p.z, it.def.surface), hit.p.z);
    if (first) it.object.position.copy(it.target);
    return true;
  }

  commitPlacing() {
    const it = this.placing;
    this.placing = null;
    it.lift = 0;
    it.scale = 0.001;
    this.engine.container.style.cursor = '';
    this.audio.place(it.def.sound || 'stone');
    if (it.def.surface === 'water') this.env.onWaterClick?.(it.target);
    this.select(it);
    this.onChange();
  }

  // --- eventos ----------------------------------------------------------------
  down(e) {
    if (e.target !== this.engine.renderer.domElement || this.engine.freeCamera) return;
    this.pointers.set(e.pointerId, e);
    if (this.pointers.size > 1) {
      // segundo dedo: desiste do gesto atual e deixa a câmera fazer pinça
      this.endDrag(true);
      this.endRake();
      this.engine.controls.enabled = true;
      return;
    }
    this.start = { x: e.clientX, y: e.clientY, moved: false };

    if (this.placing) {
      if (this.followPlacing(e)) this.engine.controls.enabled = false;
      return;
    }

    if (this.mode === 'rake') {
      const hit = this.env.pickSurface(this.rayFrom(e));
      if (hit && hit.kind === 'sand' && this.env.sand) {
        this.engine.controls.enabled = false;
        this.raking = true;
        this.env.sand.rakeStart(hit.uv);
      }
      return;
    }

    const picked = this.pickItem(e);
    if (picked) {
      const it = picked.item;
      const hit = this.env.pickSurface(this.raycaster.ray);
      const ref = hit ? hit.p : it.target;
      this.drag = { item: it, offset: new THREE.Vector3(it.target.x - ref.x, 0, it.target.z - ref.z), lifted: false };
      this.select(it);
      this.engine.controls.enabled = false;
      this.engine.container.style.cursor = 'grabbing';
    }
  }

  move(e) {
    if (this.engine.freeCamera) return;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, e);
    if (this.start && !this.start.moved && Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) > CLICK_PX) {
      this.start.moved = true;
    }

    if (this.placing) {
      this.followPlacing(e);
      return;
    }
    if (this.raking) {
      const hit = this.env.pickSurface(this.rayFrom(e));
      if (hit && hit.kind === 'sand') {
        const d = this.env.sand.rakeMove(hit.uv);
        this.audio.rake(d / Math.max(e.timeStamp - (this.lastRakeT || e.timeStamp - 16), 8) * 1000);
        this.lastRakeT = e.timeStamp;
      }
      return;
    }
    if (this.drag) {
      if (!this.start.moved) return;
      const it = this.drag.item;
      if (!this.drag.lifted) {
        this.drag.lifted = true;
        it.lift = 0.35;
        this.audio.lift();
      }
      const hit = this.env.pickSurface(this.rayFrom(e));
      if (!hit) return;
      const x = hit.p.x + this.drag.offset.x, z = hit.p.z + this.drag.offset.z;
      // revalida no ponto final (com o deslocamento da pegada), olhando de cima
      const probe = this.env.pickSurface(new THREE.Ray(new THREE.Vector3(x, 25, z), DOWN));
      if (!this.env.accepts(probe, it.def)) return;
      it.target.set(x, this.items.surfaceHeight(x, z, it.def.surface), z);
      return;
    }
    // hover
    if (e.pointerType === 'mouse' && this.mode === 'move' && !e.buttons) {
      const over = this.pickItem(e) || this.pickClickable(e);
      this.engine.container.style.cursor = over ? 'grab' : '';
    }
  }

  up(e, cancel = false) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const click = this.start && !this.start.moved && !cancel;
    this.engine.controls.enabled = true;

    if (this.placing) {
      if (click || e.pointerType !== 'mouse') {
        if (this.placing.object.visible) this.commitPlacing();
      }
      return;
    }
    if (this.raking) {
      this.endRake();
      return;
    }
    if (this.drag) {
      this.endDrag(cancel);
      return;
    }
    if (click && this.mode === 'move') {
      if (this.clickFirst?.(e)) return; // ex.: marcadores de ponto de vista
      const c = this.pickClickable(e);
      if (c) { c.onClick(); return; }
      const hit = this.env.pickSurface(this.rayFrom(e));
      if (hit && hit.kind === 'water') this.env.onWaterClick?.(hit.p);
      this.select(null);
    }
    this.start = null;
  }

  endDrag(cancel) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.engine.container.style.cursor = '';
    if (d.lifted) {
      d.item.lift = 0;
      if (!cancel) {
        // som quando assenta (espera a descida)
        setTimeout(() => this.audio.place(d.item.def.sound || 'stone'), 120);
        if (d.item.def.surface === 'water') this.env.onWaterClick?.(d.item.target);
        this.onChange();
      }
    }
  }

  endRake() {
    if (!this.raking) return;
    this.raking = false;
    this.env.sand.rakeEnd();
    this.audio.rake(0);
    this.onChange({ sand: true });
  }

  wheel(e) {
    // girar o objeto enquanto o carrega (ou o que está para ser colocado)
    const it = this.drag?.item || this.placing;
    if (!it) return;
    e.preventDefault();
    e.stopPropagation();
    it.targetRot += Math.sign(e.deltaY) * 0.2;
  }

  rotateSelected(dir) {
    const it = this.placing || this.selected;
    if (!it) return;
    it.targetRot += dir * (Math.PI / 4);
    this.onChange();
  }

  removeSelected() {
    const it = this.selected;
    if (!it) return;
    this.items.remove(it);
    this.audio.lift();
    this.select(null);
    this.onChange();
  }

  key(e) {
    if (this.engine.freeCamera) return;
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'Escape') {
      if (this.placing) this.cancelPlacing();
      else this.select(null);
    } else if (e.key === 'q' || e.key === 'Q') this.rotateSelected(-1);
    else if (e.key === 'e' || e.key === 'E') this.rotateSelected(1);
    else if (e.key === 'Delete' || e.key === 'Backspace') this.removeSelected();
  }

  update(dt, t) {
    const it = this.placing?.object.visible ? this.placing : this.selected;
    const target = it && !it.removing ? it : null;
    const m = this.ring.material;
    m.opacity += ((target ? 0.35 + Math.sin(t * 2.5) * 0.12 : 0) - m.opacity) * Math.min(1, dt * 8);
    if (target) {
      const r = (target.object.userData.radius || 0.6) * 1.05;
      this.ring.scale.setScalar(r);
      this.ring.position.set(target.object.position.x, target.target.y + 0.04, target.object.position.z);
    }
  }
}
