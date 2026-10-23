// Objetos que o jogador pode mover, girar, adicionar e remover. Cada ambiente
// fornece um catálogo { type: { label, surface, create(seed) } }; aqui ficam o
// ciclo de vida (entrar com um "pop", sair encolhendo), as luzes de cada
// objeto e a serialização para salvar o jardim.
import * as THREE from 'three';

let nextId = 1;

export class ItemManager {
  // limits: { total, perType: { tipo: máximo } } — evita que o cenário fique
  // pesado demais (cada objeto custa chamadas de desenho na cena, no reflexo e na sombra)
  constructor({ scene, catalog, lightPool, surfaceHeight, limits = {} }) {
    this.limits = { total: 40, perType: {}, ...limits };
    this.scene = scene;
    this.catalog = catalog;
    this.lightPool = lightPool;
    this.surfaceHeight = surfaceHeight; // (x, z, surface) → y
    this.items = new Set();
    this.root = new THREE.Group();
    this.root.name = 'items';
    scene.add(this.root);
    this.onChange = null;
  }

  get count() {
    let n = 0;
    for (const it of this.items) if (!it.removing) n++;
    return n;
  }

  countOf(type) {
    let n = 0;
    for (const it of this.items) if (!it.removing && it.type === type) n++;
    return n;
  }

  // Ainda cabe um objeto deste tipo? { ok, reason }
  canAdd(type) {
    const def = this.catalog[type];
    if (this.count >= this.limits.total) {
      return { ok: false, reason: `O cenário já tem ${this.limits.total} objetos. Retire algum para colocar outro.` };
    }
    const max = this.limits.perType[type];
    if (max != null && this.countOf(type) >= max) {
      return { ok: false, reason: `No máximo ${max} × ${def?.label?.toLowerCase() ?? type}. Retire um para colocar outro.` };
    }
    return { ok: true };
  }

  add(type, { x = 0, z = 0, rot = 0, seed = Math.floor(Math.random() * 1e6), opts = null, pop = false } = {}) {
    const def = this.catalog[type];
    if (!def) return null;
    const object = def.create(seed, opts || {});
    const y = this.surfaceHeight(x, z, def.surface);
    object.position.set(x, y, z);
    object.rotation.y = rot;
    const item = {
      id: nextId++, type, seed, opts, def, object,
      target: new THREE.Vector3(x, y, z),
      targetRot: rot,
      lift: 0,
      scale: pop ? 0.001 : 1,
      targetScale: 1,
      anchors: [],
      removing: false,
    };
    object.userData.item = item;
    object.traverse((o) => { o.userData.item = item; });
    for (const l of object.userData.lights || []) {
      item.anchors.push(this.lightPool.add({ ...l, object }));
    }
    object.scale.setScalar(item.scale);
    this.root.add(object);
    this.items.add(item);
    return item;
  }

  remove(item) {
    item.removing = true;
    item.targetScale = 0;
    for (const a of item.anchors) this.lightPool.remove(a);
    item.anchors = [];
  }

  clear() {
    for (const it of this.items) {
      for (const a of it.anchors) this.lightPool.remove(a);
      this.root.remove(it.object);
    }
    this.items.clear();
  }

  update(dt, t) {
    const k = 1 - Math.exp(-dt * 12);
    for (const it of this.items) {
      const o = it.object;
      o.position.x += (it.target.x - o.position.x) * k;
      o.position.z += (it.target.z - o.position.z) * k;
      const ty = it.target.y + it.lift;
      o.position.y += (ty - o.position.y) * k;
      let dr = it.targetRot - o.rotation.y;
      o.rotation.y += dr * Math.min(1, dt * 8);
      // leve inclinação enquanto é carregado, como algo pendurado
      const tilt = it.lift > 0 ? 0.05 : 0;
      o.rotation.z += ((it.lift > 0 ? Math.sin(t * 2) * tilt : 0) - o.rotation.z) * k;
      it.scale += (it.targetScale - it.scale) * (1 - Math.exp(-dt * (it.removing ? 9 : 7)));
      // "pop" com leve overshoot na entrada
      const s = it.removing ? it.scale : it.scale + Math.sin(Math.min(it.scale, 1) * Math.PI) * 0.08;
      o.scale.setScalar(Math.max(s, 0.0001));
      o.userData.animate?.(dt, t, it); // bichos e afins se mexem sozinhos
      if (o.userData.float) o.position.y = it.target.y + it.lift + Math.sin(t * 0.9 + it.id) * 0.008;
      if (it.removing && it.scale < 0.02) {
        this.root.remove(o);
        this.items.delete(it);
      }
    }
  }

  serialize() {
    return [...this.items].filter((i) => !i.removing).map((i) => ({
      type: i.type, seed: i.seed, ...(i.opts ? { opts: i.opts } : {}),
      x: +i.target.x.toFixed(3), z: +i.target.z.toFixed(3), rot: +i.targetRot.toFixed(3),
    }));
  }

  load(list) {
    this.clear();
    for (const d of list) this.add(d.type, d);
  }
}
