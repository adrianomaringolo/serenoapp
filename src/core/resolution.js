// Resolução dinâmica: mede o intervalo entre quadros e ajusta a densidade de
// pixels da renderização. O custo do jogo é quase todo por pixel (ver
// scripts/bench.js), então essa é a alavanca que mais importa: um Mac
// rápido fica nítido, um notebook mais fraco reduz sozinho em vez de travar.
//
// Mira 60 fps (ou a taxa da tela, se for menor que isso a cada quadro). Desce
// rápido quando falta fôlego e sobe devagar quando sobra; se subir e piorar
// logo em seguida, segura aquele teto por um tempo para não ficar oscilando.
export class ResolutionGovernor {
  constructor(engine, { min = 1, max = 1.5, step = 0.125, window = 60 } = {}) {
    this.engine = engine;
    this.min = min;
    this.max = max;
    this.step = step;
    this.window = window;
    this.pixelRatio = engine.renderer.getPixelRatio();
    this.samples = [];
    this.last = 0;
    this.vsync = Infinity;
    this.lastChange = 0;
    this.lastRaise = -1e9;
    this.good = 0;
    this.cap = max;
    this.capUntil = 0;
    this.enabled = true;
  }

  apply(pr, now) {
    pr = Math.round(Math.min(this.max, Math.max(this.min, pr)) / this.step) * this.step;
    if (pr === this.pixelRatio) return;
    this.pixelRatio = pr;
    this.engine.setPixelRatio(pr);
    this.lastChange = now;
    this.samples = [];
    this.last = 0; // o quadro da troca de resolução não conta
  }

  frame(now) {
    if (!this.enabled) return;
    if (this.last) {
      const dt = now - this.last;
      if (dt < 250) this.samples.push(dt); // ignora pausas (aba escondida, depurador)
    }
    this.last = now;
    if (this.samples.length < this.window) return;

    const s = this.samples.sort((a, b) => a - b);
    const med = s[s.length >> 1];
    this.vsync = Math.min(this.vsync, s[Math.floor(s.length * 0.1)]);
    this.samples = [];
    this.lastMedian = med;
    if (now - this.lastChange < 1500) return;

    const target = Math.max(this.vsync, 1000 / 60) * 1.04;
    if (now > this.capUntil) this.cap = this.max;

    if (med > target * 1.18 && this.pixelRatio > this.min) {
      this.good = 0;
      const next = this.pixelRatio - this.step * (med > target * 1.6 ? 2 : 1);
      if (now - this.lastRaise < 6000) {
        this.cap = next; // acabou de subir e piorou: esse é o teto por ora
        this.capUntil = now + 30000;
      }
      this.apply(next, now);
    } else if (med <= target && this.pixelRatio < this.cap) {
      if (++this.good >= 4) {
        this.good = 0;
        this.lastRaise = now;
        this.apply(this.pixelRatio + this.step, now);
      }
    } else {
      this.good = 0;
    }
  }
}
