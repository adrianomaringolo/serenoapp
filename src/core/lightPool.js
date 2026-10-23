// Um número fixo de luzes pontuais, emprestadas às fontes de luz mais próximas
// da câmera (lanternas, velas...). Assim o jogador pode pôr quantas velas quiser
// sem que cada nova luz force a recompilação de todos os shaders da cena.
import * as THREE from 'three';

export class LightPool {
  constructor(scene, size = 6) {
    this.lights = [];
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 8, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.anchors = new Set();
    this.factor = 1; // multiplicador do momento do dia (lanternas mais fortes à noite)
  }

  // anchor: { object, offset, color, intensity, distance, flicker, day }
  //  - day: fração da intensidade que sobra de dia (velas ainda brilham um pouco)
  add(anchor) {
    anchor.offset = anchor.offset || new THREE.Vector3();
    anchor.color = new THREE.Color(anchor.color ?? 0xffaa55);
    anchor.seed = Math.random() * 100;
    anchor.world = new THREE.Vector3();
    this.anchors.add(anchor);
    return anchor;
  }

  remove(anchor) {
    this.anchors.delete(anchor);
  }

  update(camera, t) {
    const list = [];
    for (const a of this.anchors) {
      if (!a.object.parent) continue;
      a.world.copy(a.offset);
      a.object.localToWorld(a.world);
      a.dist = a.world.distanceToSquared(camera.position);
      list.push(a);
    }
    list.sort((a, b) => a.dist - b.dist);
    this.lights.forEach((l, i) => {
      const a = list[i];
      if (!a) {
        l.intensity = 0;
        return;
      }
      l.position.copy(a.world);
      l.color.copy(a.color);
      l.distance = a.distance ?? 8;
      let k = (a.day ?? 0) + (1 - (a.day ?? 0)) * this.factor;
      if (a.flicker) {
        const s = a.seed;
        k *= 0.82 + 0.1 * Math.sin(t * 11 + s) + 0.06 * Math.sin(t * 23.7 + s * 2) + 0.05 * Math.sin(t * 5.3 + s * 3);
      }
      l.intensity = (a.intensity ?? 3) * k * (a.scale ?? 1);
    });
  }
}
