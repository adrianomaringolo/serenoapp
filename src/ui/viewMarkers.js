// Marcadores dos pontos de vista: um ponto de luz flutuando sobre cada lugar
// do "Ir para". Tamanho constante na tela (fácil de tocar de longe), pulsa
// devagar, mostra o nome ao passar o mouse e leva até lá ao clicar.
// Ficam na camada 1: a câmera principal vê, o reflexo do lago e as sombras não.
import * as THREE from 'three';

const LAYER = 1;

function markerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,248,232,1)');
  g.addColorStop(0.18, 'rgba(255,236,200,0.95)');
  g.addColorStop(0.32, 'rgba(255,220,170,0.35)');
  g.addColorStop(1, 'rgba(255,210,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,240,215,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(64, 64, 40, 0, Math.PI * 2); ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ViewMarkers {
  constructor({ engine, env, onPick }) {
    this.engine = engine;
    this.onPick = onPick;
    this.visible = true;
    engine.camera.layers.enable(LAYER);
    const tex = markerTexture();
    this.markers = (env.viewpoints || []).map((vp, i) => {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, opacity: 0 });
      const s = new THREE.Sprite(mat);
      // sobre o lugar: acima do ponto para onde a vista olha
      const at = vp.marker ? vp.marker.clone() : vp.target.clone().add(new THREE.Vector3(0, 1.6, 0));
      s.position.copy(at);
      s.layers.set(LAYER);
      s.renderOrder = 20;
      s.userData = { vp, base: at.clone(), phase: i * 1.7, hover: 0 };
      engine.scene.add(s);
      return s;
    });
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.set(LAYER);
    this.label = document.getElementById('vp-label');
    this.hovered = null;
    const canvas = engine.renderer.domElement;
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      this.hovered = this.pick(e);
      canvas.style.cursor = this.hovered ? 'pointer' : canvas.style.cursor === 'pointer' ? '' : canvas.style.cursor;
    });
    engine.onRealUpdate((dt) => this.update(dt));
  }

  pick(e) {
    if (!this.visible || this.hidden) return null;
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.engine.camera);
    const vis = this.markers.filter((m) => m.material.opacity > 0.15);
    const hit = this.raycaster.intersectObjects(vis, false)[0];
    return hit ? hit.object : null;
  }

  // chamado antes do clique normal; true = o clique era num marcador
  handleClick(e) {
    const m = this.pick(e);
    if (!m) return false;
    this.hovered = null;
    this.onPick(m.userData.vp);
    return true;
  }

  setVisible(on) {
    this.visible = on;
  }

  update(dt) {
    const cam = this.engine.camera;
    const t = performance.now() / 1000;
    // escondidos no modo foto, na contemplação e quando a interface some
    this.hidden = !!this.engine.freeCamera?.isPhoto || document.body.classList.contains('zen');
    let labelFor = null;
    for (const m of this.markers) {
      const { vp, base, phase } = m.userData;
      m.position.copy(base);
      m.position.y += Math.sin(t * 1.1 + phase) * 0.12;
      // some quando você já está nesse lugar (ou muito perto do marcador)
      const here = cam.position.distanceTo(vp.position) < 2.5 || cam.position.distanceTo(base) < 2.5;
      const want = this.visible && !this.hidden && !here ? 1 : 0;
      const hov = m === this.hovered ? 1 : 0;
      m.userData.hover += (hov - m.userData.hover) * Math.min(1, dt * 10);
      m.material.opacity += ((want ? 0.75 + 0.25 * Math.sin(t * 2 + phase) : 0) - m.material.opacity) * Math.min(1, dt * 4);
      m.scale.setScalar(0.034 * (1 + 0.08 * Math.sin(t * 2 + phase) + m.userData.hover * 0.35));
      if (hov && want) labelFor = m;
    }
    // nome do lugar ao lado do marcador
    if (labelFor) {
      const p = labelFor.position.clone().project(cam);
      const r = this.engine.renderer.domElement.getBoundingClientRect();
      this.label.textContent = labelFor.userData.vp.name;
      this.label.style.left = `${r.left + (p.x * 0.5 + 0.5) * r.width}px`;
      this.label.style.top = `${r.top + (-p.y * 0.5 + 0.5) * r.height}px`;
      this.label.classList.add('show');
    } else {
      this.label.classList.remove('show');
    }
  }
}
