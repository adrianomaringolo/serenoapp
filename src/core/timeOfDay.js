// Momentos do dia. Cada ambiente pode trazer os seus; estes são o padrão.
// A troca entre momentos é uma transição lenta (como o céu de verdade), e
// tudo que depende da luz — céu, sol, névoa, lanternas, vaga-lumes, sons —
// lê o estado interpolado em `current`.
import * as THREE from 'three';

const C = (h) => new THREE.Color(h);
const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

export const DEFAULT_PRESETS = {
  amanhecer: {
    label: 'Amanhecer',
    zenith: C('#6f8fc4'), horizon: C('#f2c4a0'), ground: C('#5e5b5c'),
    sunDir: V(-0.75, 0.1, -0.65), sunColor: C('#ffcf9e'), sunIntensity: 2.2, sunSize: 0.9994, glow: 1.0,
    hemiSky: C('#b9c8e6'), hemiGround: C('#4d5338'), hemiIntensity: 0.55,
    envIntensity: 0.55, exposure: 0.95,
    fogColor: C('#d2c4bd'), fogDensity: 0.013,
    clouds: 0.6, cloudColor: C('#ffe0cc'), cloudShadow: C('#8f93ab'), stars: 0,
    mountain: C('#56607a'),
    lantern: 0.3, fireflies: 0, mist: 1.0, bloom: 0.35, birds: 1, crickets: 0, leafGlow: 0.08,
  },
  dia: {
    label: 'Dia',
    zenith: C('#4a82c4'), horizon: C('#cfe0ee'), ground: C('#77776f'),
    sunDir: V(-0.45, 0.78, 0.45), sunColor: C('#fff1dc'), sunIntensity: 3.0, sunSize: 0.9995, glow: 0.45,
    hemiSky: C('#cfe3ff'), hemiGround: C('#55603f'), hemiIntensity: 0.65,
    envIntensity: 0.8, exposure: 0.85,
    fogColor: C('#c3d4e2'), fogDensity: 0.011,
    clouds: 0.55, cloudColor: C('#ffffff'), cloudShadow: C('#a7b4c6'), stars: 0,
    mountain: C('#5f7590'),
    lantern: 0.05, fireflies: 0, mist: 0.25, bloom: 0.2, birds: 0.8, crickets: 0, leafGlow: 0.04,
  },
  entardecer: {
    label: 'Entardecer',
    zenith: C('#3b4c85'), horizon: C('#f2965e'), ground: C('#463638'),
    sunDir: V(0.55, 0.07, -0.83), sunColor: C('#ffa155'), sunIntensity: 2.6, sunSize: 0.9993, glow: 1.4,
    hemiSky: C('#a99ccc'), hemiGround: C('#4a4432'), hemiIntensity: 0.6,
    envIntensity: 0.65, exposure: 1.15,
    fogColor: C('#d29a7c'), fogDensity: 0.0115,
    clouds: 0.7, cloudColor: C('#ffb078'), cloudShadow: C('#6a4e6e'), stars: 0.05,
    mountain: C('#5a4762'),
    lantern: 0.75, fireflies: 0.45, mist: 0.5, bloom: 0.45, birds: 0.25, crickets: 0.35, leafGlow: 0.14,
  },
  noite: {
    label: 'Noite',
    zenith: C('#040917'), horizon: C('#1a2746'), ground: C('#06070c'),
    sunDir: V(-0.3, 0.42, -0.85), sunColor: C('#b6c6ff'), sunIntensity: 0.5, sunSize: 0.99965, glow: 0.35,
    hemiSky: C('#3a4a7a'), hemiGround: C('#0b0e14'), hemiIntensity: 0.35,
    envIntensity: 0.4, exposure: 1.2,
    fogColor: C('#172038'), fogDensity: 0.016,
    clouds: 0.3, cloudColor: C('#4a5878'), cloudShadow: C('#0f1528'), stars: 1,
    mountain: C('#0f1424'),
    lantern: 1, fireflies: 1, mist: 0.6, bloom: 0.6, birds: 0, crickets: 1, leafGlow: 0.02,
  },
};

export const PRESET_ORDER = ['amanhecer', 'dia', 'entardecer', 'noite'];

// Momentos do dia de um ambiente: os padrões com o que ele muda em cada um
// (ex.: { amanhecer: { fogDensity: 0.03 } }).
export function withPresets(overrides = {}) {
  const out = {};
  for (const [name, base] of Object.entries(DEFAULT_PRESETS)) out[name] = { ...base, ...(overrides[name] || {}) };
  return out;
}

function cloneState(s) {
  const o = {};
  for (const k in s) o[k] = s[k] && s[k].clone ? s[k].clone() : s[k];
  return o;
}

export class TimeOfDay {
  constructor(presets = DEFAULT_PRESETS, initial = 'entardecer') {
    this.presets = presets;
    this.name = initial;
    this.current = cloneState(presets[initial]);
    this.from = null;
    this.to = null;
    this.t = 1;
    this.duration = 1;
  }

  set(name, duration = 5) {
    if (!this.presets[name]) return;
    this.fromName = this.name;
    this.name = name;
    if (duration <= 0) {
      this.current = cloneState(this.presets[name]);
      this.t = 1;
      return;
    }
    this.from = cloneState(this.current);
    this.to = this.presets[name];
    this.t = 0;
    this.duration = duration;
  }

  next() {
    const i = PRESET_ORDER.indexOf(this.name);
    this.set(PRESET_ORDER[(i + 1) % PRESET_ORDER.length]);
    return this.name;
  }

  get transitioning() {
    return this.t < 1;
  }

  update(dt) {
    if (this.t >= 1) return false;
    this.t = Math.min(1, this.t + dt / this.duration);
    const k = this.t * this.t * (3 - 2 * this.t);
    const { from, to, current } = this;
    for (const key in to) {
      const a = from[key], b = to[key];
      if (typeof b === 'number') current[key] = a + (b - a) * k;
      else if (b && b.isColor) current[key].copy(a).lerp(b, k);
      else if (b && b.isVector3) current[key].copy(a).lerp(b, k).normalize();
      else current[key] = b;
    }
    return true;
  }
}
