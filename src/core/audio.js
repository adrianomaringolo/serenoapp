// Trilha generativa, sem arquivos de áudio: tudo sintetizado na hora com Web
// Audio. Nunca se repete igual.
//  - pads: acordes da escala pentatônica que entram e saem devagar
//  - melodia: notas esparsas, como um koto/kalimba distante
//  - tigela tibetana de tempos em tempos
//  - natureza: vento, água corrente, grilos (noite), pássaros (manhã)
//  - efeitos: "toc" do bambu, pedra assentando, gota na água, rastelo na areia
// Cada ambiente define o humor (tônica e escala) com setMood().

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Cascata pequena: o chiado largo da água caindo e o borbulhar do riacho.
// O borbulhar é ruído marrom num passa-altas ressonante cuja frequência é
// sacudida por outro ruído marrom bem lento (a receita clássica do "babbling
// brook"): cada pico de ressonância soa como uma bolha estourando. Devolve o
// ganho de saída (começa em 0).
export function createCascadeSound(ctx, dest, { roar: kRoar = 1, hiss: kHiss = 1, babble: kBabble = 1 } = {}) {
  const len = ctx.sampleRate * 8;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b = 0, peak = 0;
  for (let i = 0; i < len; i++) {
    b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = b;
    peak = Math.max(peak, Math.abs(b));
  }
  for (let i = 0; i < len; i++) d[i] /= peak;
  const brown = () => {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(0, Math.random() * 7);
    return s;
  };
  const filter = (type, f, q = 0.7) => {
    const n = ctx.createBiquadFilter();
    n.type = type; n.frequency.value = f; n.Q.value = q;
    return n;
  };
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(dest);

  // a queda: ruído largo e encorpado, que respira devagar
  const roar = brown();
  const roarG = ctx.createGain();
  roarG.gain.value = 0.21 * kRoar;
  roar.connect(filter('highpass', 220)).connect(filter('lowpass', 2600)).connect(roarG).connect(out);
  const white = ctx.createBufferSource();
  {
    const wb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const wd = wb.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    white.buffer = wb; white.loop = true; white.start(0, Math.random() * 3);
  }
  const hissG = ctx.createGain();
  hissG.gain.value = 0.05 * kHiss;
  white.connect(filter('bandpass', 3200, 0.5)).connect(hissG).connect(out);
  const sway = brown();
  const swayG = ctx.createGain();
  swayG.gain.value = 0.07 * kRoar;
  sway.connect(filter('lowpass', 0.6)).connect(swayG).connect(roarG.gain);

  // o borbulhar: duas camadas, uma mais grave e outra mais aguda
  for (const [base, depth, rate, q, vol] of [[480, 380, 14, 20, 0.07], [1050, 650, 20, 18, 0.045]]) {
    const hp = filter('highpass', base, q);
    const g = ctx.createGain();
    g.gain.value = vol * kBabble;
    brown().connect(filter('lowpass', 3000)).connect(hp).connect(g).connect(out);
    const mod = ctx.createGain();
    mod.gain.value = depth * 3;
    brown().connect(filter('lowpass', rate)).connect(mod).connect(hp.frequency);
  }
  return out;
}

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.mood = {
      root: 'D',
      scale: [0, 2, 4, 7, 9],
      // acordes em semitons a partir da tônica na oitava 2
      chords: [[0, 7, 14, 16], [-3, 4, 7, 12], [2, 9, 12, 16], [-5, 2, 9, 12], [0, 7, 12, 19]],
    };
    // noise: o chiado contínuo de vento e água corrente, com volume próprio
    this.levels = { music: 0.6, nature: 0.7, noise: 0.6 };
    this.env = { birds: 0, crickets: 0, water: 1, wind: 1 };
    this.muted = false;
    this.timers = {};
  }

  get started() {
    return !!this.ctx;
  }

  async start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.gain.setTargetAtTime(this.muted ? 0 : 0.9, ctx.currentTime, 2.5);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    this.master = master;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(6, 2.2);
    const revGain = ctx.createGain();
    revGain.gain.value = 0.9;
    this.reverb.connect(revGain).connect(master);

    const bus = (level) => {
      const g = ctx.createGain();
      g.gain.value = level;
      g.connect(master);
      return g;
    };
    this.musicBus = bus(this.levels.music);
    this.natureBus = bus(this.levels.nature);
    this.noiseBus = bus(this.levels.noise);
    this.sfxBus = bus(0.8);
    this.musicSend = ctx.createGain();
    this.musicSend.gain.value = 0.7;
    this.musicSend.connect(this.reverb);
    this.musicSend.gain.value = 0.7;
    this.sfxSend = ctx.createGain();
    this.sfxSend.gain.value = 0.5;
    this.sfxSend.connect(this.reverb);

    this.noise = this.noiseBuffer(6);
    this.startDrone();
    this.startNature();
    if (this.env.cascade > 0) this.setEnvironment({ cascade: this.env.cascade, force: true });
    this.next = { chord: ctx.currentTime + 0.5, melody: ctx.currentTime + 6, bowl: ctx.currentTime + 3, bird: ctx.currentTime + 4, cricket: ctx.currentTime + 1 };
    this.scheduler = setInterval(() => this.tick(), 200);
  }

  // ---------------------------------------------------------------------------
  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (t < 0.01 ? t / 0.01 : 1);
      }
    }
    return buf;
  }

  noiseBuffer(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0; // ruído rosa (Paul Kellet, versão econômica)
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
    return buf;
  }

  noiseSource() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random() * 2;
    s.start(0, Math.random() * 5);
    return s;
  }

  rootMidi(octave = 2) {
    return 12 * (octave + 1) + NOTE[this.mood.root];
  }

  // ---------------------------------------------------------------------------
  startDrone() {
    const ctx = this.ctx;
    const f = midiToHz(this.rootMidi(1));
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    [1, 1.5, 2.003].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = f * m;
      const og = ctx.createGain();
      og.gain.value = [1, 0.25, 0.3][i];
      o.connect(og).connect(lp);
      o.start();
    });
    // respiração lenta do filtro
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 90;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
    lp.connect(g);
    g.connect(this.musicBus);
    g.connect(this.musicSend);
    this.drone = { lp, g };
  }

  playChord(time) {
    const ctx = this.ctx;
    const chord = pick(this.mood.chords);
    const base = this.rootMidi(2);
    const dur = rand(16, 22);
    const atk = 6, rel = 9;
    chord.forEach((semi, i) => {
      const f = midiToHz(base + semi);
      const out = ctx.createGain();
      out.gain.value = 0;
      const peak = 0.06 / (1 + i * 0.25);
      out.gain.setValueAtTime(0, time);
      out.gain.linearRampToValueAtTime(peak, time + atk + i * 0.8);
      out.gain.setValueAtTime(peak, time + dur);
      out.gain.linearRampToValueAtTime(0, time + dur + rel);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(500, time);
      lp.frequency.linearRampToValueAtTime(rand(900, 1500), time + dur * 0.5);
      lp.frequency.linearRampToValueAtTime(600, time + dur + rel);
      lp.Q.value = 0.4;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) pan.pan.value = rand(-0.6, 0.6);
      for (const [type, det, g] of [['sine', 0, 1], ['triangle', rand(3, 7), 0.45], ['sine', -rand(3, 7), 0.5]]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = g;
        o.connect(og).connect(lp);
        o.start(time);
        o.stop(time + dur + rel + 0.5);
      }
      if (pan) lp.connect(pan).connect(out); else lp.connect(out);
      out.connect(this.musicBus);
      out.connect(this.musicSend);
    });
    return dur;
  }

  pluck(time, midi, vel = 0.12) {
    const ctx = this.ctx;
    const f = midiToHz(midi);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, time);
    out.gain.linearRampToValueAtTime(vel, time + 0.006);
    out.gain.exponentialRampToValueAtTime(vel * 0.3, time + 0.4);
    out.gain.exponentialRampToValueAtTime(0.0001, time + 3.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4200, time);
    lp.frequency.exponentialRampToValueAtTime(900, time + 1.5);
    [[1, 1], [2, 0.35], [3.01, 0.12], [4.2, 0.05]].forEach(([m, g]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * m;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(lp);
      o.start(time);
      o.stop(time + 3.6);
    });
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = rand(-0.5, 0.5); lp.connect(pan).connect(out); } else lp.connect(out);
    out.connect(this.musicBus);
    out.connect(this.musicSend);
  }

  playPhrase(time) {
    const scale = this.mood.scale;
    const base = this.rootMidi(4);
    let idx = Math.floor(rand(0, scale.length * 2));
    const n = Math.random() < 0.6 ? 1 : Math.floor(rand(2, 4));
    let t = time;
    for (let i = 0; i < n; i++) {
      idx = Math.max(0, Math.min(scale.length * 2 - 1, idx + pick([-2, -1, 1, 2])));
      const midi = base + scale[idx % scale.length] + 12 * Math.floor(idx / scale.length);
      this.pluck(t, midi, rand(0.06, 0.11));
      t += pick([0.5, 0.75, 1, 1.5]);
    }
  }

  // Tigela tibetana: parciais inarmônicos, cada um com batimento lento.
  bowl(time = this.ctx.currentTime, freq = null, vel = 0.16) {
    const ctx = this.ctx;
    const f = freq || midiToHz(this.rootMidi(3) + pick([0, 7, 12]));
    const out = ctx.createGain();
    out.gain.value = vel;
    out.connect(this.musicBus);
    out.connect(this.musicSend);
    [[1, 1, 12], [2.76, 0.5, 8], [5.4, 0.22, 5], [8.93, 0.08, 3]].forEach(([m, g, dec]) => {
      for (const beat of [0, rand(0.6, 1.4)]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * m + beat;
        const og = ctx.createGain();
        og.gain.setValueAtTime(0, time);
        og.gain.linearRampToValueAtTime(g * 0.5, time + 0.015);
        og.gain.exponentialRampToValueAtTime(0.0001, time + dec);
        o.connect(og).connect(out);
        o.start(time);
        o.stop(time + dec + 0.1);
      }
    });
  }

  // ---------------------------------------------------------------------------
  startNature() {
    const ctx = this.ctx;
    // vento: ruído em banda que sobe e desce
    const wind = this.noiseSource();
    const wbp = ctx.createBiquadFilter();
    wbp.type = 'bandpass';
    wbp.frequency.value = 420;
    wbp.Q.value = 0.7;
    const wg = ctx.createGain();
    wg.gain.value = 0.25;
    wind.connect(wbp).connect(wg).connect(this.noiseBus);
    this.wind = { f: wbp, g: wg };

    // água corrente: ruído agudo com borbulhar sutil
    const water = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 1900;
    hp.Q.value = 0.9;
    const wag = ctx.createGain();
    wag.gain.value = 0.12 * this.env.water;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 3.3;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.03;
    lfo.connect(lfoG).connect(wag.gain);
    lfo.start();
    water.connect(hp).connect(wag).connect(this.noiseBus);
    this.water = { g: wag };

    // ruído contínuo para o rastelo (volume controlado pela velocidade)
    const rake = this.noiseSource();
    const rbp = ctx.createBiquadFilter();
    rbp.type = 'bandpass';
    rbp.frequency.value = 2600;
    rbp.Q.value = 0.6;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    rake.connect(rbp).connect(rg).connect(this.sfxBus);
    this.rakeGain = rg;
  }

  cricket(time) {
    const ctx = this.ctx;
    const f = rand(4200, 4800);
    const out = ctx.createGain();
    out.gain.value = 0.018 * this.env.crickets;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = rand(-0.9, 0.9); out.connect(pan).connect(this.natureBus); } else out.connect(this.natureBus);
    const pulses = Math.floor(rand(3, 6));
    for (let i = 0; i < pulses; i++) {
      const t = time + i * 0.055;
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.008);
      g.gain.linearRampToValueAtTime(0, t + 0.035);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.04);
    }
  }

  bird(time) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.035 * this.env.birds;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = rand(-0.8, 0.8); out.connect(pan).connect(this.natureBus); } else out.connect(this.natureBus);
    out.connect(this.sfxSend);
    const notes = Math.floor(rand(2, 6));
    const base = rand(2600, 3800);
    let t = time;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f0 = base * rand(0.85, 1.2), f1 = f0 * rand(0.7, 1.4);
      const d = rand(0.06, 0.16);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + d);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + d + 0.02);
      t += d + rand(0.03, 0.12);
    }
  }

  // ---------------------------------------------------------------------------
  tick() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const ahead = now + 0.3;
    if (this.next.chord < ahead) {
      const dur = this.playChord(this.next.chord);
      this.next.chord += dur + rand(-2, 1);
    }
    if (this.next.melody < ahead) {
      if (Math.random() < 0.75) this.playPhrase(this.next.melody);
      this.next.melody += rand(3.5, 9);
    }
    if (this.next.bowl < ahead) {
      this.bowl(this.next.bowl, null, rand(0.08, 0.14));
      this.next.bowl += rand(28, 55);
    }
    if (this.next.bird < ahead) {
      if (this.env.birds > 0.05 && Math.random() < this.env.birds) this.bird(this.next.bird);
      this.next.bird += rand(2.5, 9);
    }
    if (this.next.cricket < ahead) {
      if (this.env.crickets > 0.05) this.cricket(this.next.cricket);
      this.next.cricket += rand(0.35, 1.4) / Math.max(this.env.crickets, 0.3);
    }
    // rajadas de vento
    if (!this.windNext || now > this.windNext) {
      const target = rand(0.12, 0.4) * this.env.wind;
      this.wind.g.gain.setTargetAtTime(target, now, rand(2, 4));
      this.wind.f.frequency.setTargetAtTime(rand(280, 650), now, 3);
      this.windNext = now + rand(4, 9);
      this.gust = target;
    }
  }

  // ---------------------------------------------------------------------------
  // Efeitos
  knock() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(this.sfxBus);
    out.connect(this.sfxSend);
    for (const [f, g, d] of [[480, 1, 0.22], [1150, 0.45, 0.12], [2300, 0.15, 0.06]]) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * 1.04, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      const og = ctx.createGain();
      og.gain.setValueAtTime(g, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(og).connect(out);
      o.start(t);
      o.stop(t + d + 0.05);
    }
    const n = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.5;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.6, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    n.connect(bp).connect(ng).connect(out);
    n.stop(t + 0.1);
  }

  pour() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    n.connect(bp).connect(g).connect(this.sfxBus);
    g.connect(this.sfxSend);
    n.stop(t + 1);
  }

  place(kind = 'stone') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    if (kind === 'water') return this.plip(0.8);
    const out = ctx.createGain();
    out.gain.value = kind === 'wood' ? 0.35 : 0.45;
    out.connect(this.sfxBus);
    out.connect(this.sfxSend);
    const f = kind === 'wood' ? 220 : 130;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.9, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(og).connect(out);
    o.start(t); o.stop(t + 0.3);
    const n = this.noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = kind === 'wood' ? 2500 : 1400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(lp).connect(ng).connect(out);
    n.stop(t + 0.1);
    // um sininho suave que lembra que algo novo entrou no jardim
    if (kind === 'chime') this.pluck(t + 0.05, this.rootMidi(5) + pick(this.mood.scale), 0.05);
  }

  plip(vel = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const o = ctx.createOscillator();
    const f = rand(700, 1000);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.sfxBus);
    g.connect(this.sfxSend);
    o.start(t); o.stop(t + 0.2);
  }

  // galhos sacudidos: um farfalhar que cresce e some, e notas soltas caindo
  rustle() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const n = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    n.connect(bp).connect(g).connect(this.sfxBus);
    g.connect(this.sfxSend);
    n.stop(t + 1.9);
    const base = this.rootMidi(5);
    for (let i = 0; i < 4; i++) this.pluck(t + 0.25 + i * rand(0.22, 0.45), base + pick(this.mood.scale) + pick([0, 12]), rand(0.02, 0.04));
  }

  // obturador: dois estalos mecânicos curtos (abre e fecha a cortina)
  shutter() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.01;
    for (const [dt, f, g] of [[0, 3200, 0.5], [0.07, 2400, 0.35]]) {
      const t = t0 + dt;
      const n = this.noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 2.5;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(g, t + 0.002);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      n.connect(bp).connect(ng).connect(this.sfxBus);
      n.stop(t + 0.06);
    }
  }

  // passos ao caminhar: madeira oca, grama macia ou pedra
  step(kind = 'grass') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.005;
    const n = this.noiseSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    if (kind === 'wood') {
      f.type = 'bandpass'; f.frequency.value = 650 + Math.random() * 150; f.Q.value = 1.4;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(150 + Math.random() * 30, t);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.12, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(og).connect(this.sfxBus); o.start(t); o.stop(t + 0.12);
    } else {
      f.type = 'bandpass'; f.frequency.value = 2600 + Math.random() * 1200; f.Q.value = 0.7;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    }
    n.connect(f).connect(g).connect(this.sfxBus);
    n.stop(t + 0.25);
  }

  focusBeep() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.pluck(t, this.rootMidi(6) + 7, 0.012);
  }

  lift() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.pluck(t, this.rootMidi(5) + pick(this.mood.scale), 0.025);
  }

  rake(speed) {
    if (!this.ctx) return;
    const v = Math.min(speed * 0.06, 0.16);
    this.rakeGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------------------
  setLevels({ music, nature, noise }) {
    if (music != null) this.levels.music = music;
    if (nature != null) this.levels.nature = nature;
    if (noise != null) this.levels.noise = noise;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.levels.music, t, 0.2);
    this.natureBus.gain.setTargetAtTime(this.levels.nature, t, 0.2);
    this.noiseBus.gain.setTargetAtTime(this.levels.noise, t, 0.2);
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.4);
  }

  setMood(mood) {
    Object.assign(this.mood, mood);
  }

  // Natureza acompanha o momento do dia (grilos à noite, pássaros de manhã);
  // `water` é o volume da água corrente (1 = filete; um riacho pede mais).
  // `cascade` (0–1): uma cascata por perto — o ambiente vai mudando conforme a
  // câmera se aproxima ou se afasta das quedas d'água.
  setEnvironment({ birds, crickets, water, cascade, force = false }) {
    if (birds != null) this.env.birds = birds;
    if (crickets != null) this.env.crickets = crickets;
    if (water != null && water !== this.env.water) {
      this.env.water = water;
      if (this.water) this.water.g.gain.setTargetAtTime(0.12 * water, this.ctx.currentTime, 1.5);
    }
    if (cascade != null && (force || Math.abs(cascade - (this.env.cascade ?? 0)) > 0.01)) {
      this.env.cascade = cascade;
      if (!this.ctx) return;
      if (!this.cascadeOut && cascade > 0) this.cascadeOut = createCascadeSound(this.ctx, this.noiseBus);
      this.cascadeOut?.gain.setTargetAtTime(cascade, this.ctx.currentTime, 0.8);
    }
  }
}
