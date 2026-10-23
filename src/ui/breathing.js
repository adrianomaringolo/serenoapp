// Respiração guiada: um círculo que cresce na inspiração e encolhe na
// expiração, com sessão opcional de 5/10/15 min marcada por tigelas.
const PATTERNS = {
  calma: [['Inspire', 4, 'in'], ['Expire', 6, 'out']],
  quadrada: [['Inspire', 4, 'in'], ['Segure', 4, 'hold'], ['Expire', 4, 'out'], ['Segure', 4, 'hold']],
  478: [['Inspire', 4, 'in'], ['Segure', 7, 'hold'], ['Expire', 8, 'out']],
};

const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

export class Breathing {
  constructor({ audio, onPulse }) {
    this.audio = audio;
    this.onPulse = onPulse || (() => {});
    this.el = document.getElementById('breath');
    this.orb = document.getElementById('breath-orb');
    this.label = document.getElementById('breath-label');
    this.timer = document.getElementById('breath-timer');
    this.patternSel = document.getElementById('breath-pattern');
    this.lengthSel = document.getElementById('breath-length');
    this.active = false;
    this.patternSel.addEventListener('change', () => this.restartCycle());
    this.lengthSel.addEventListener('change', () => this.startSession());
    document.getElementById('breath-close').addEventListener('click', () => this.stop());
    this.scale = 0.35;
  }

  toggle() {
    this.active ? this.stop() : this.start();
    return this.active;
  }

  start() {
    this.active = true;
    this.el.hidden = false;
    this.restartCycle();
    this.startSession();
    this.onToggle?.(true);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.el.hidden = true;
    this.onToggle?.(false);
    this.onPulse(0);
  }

  restartCycle() {
    this.cycleStart = performance.now();
    this.lastPhase = -1;
  }

  startSession() {
    const len = +this.lengthSel.value;
    this.sessionEnd = len ? performance.now() + len * 1000 : 0;
    if (len && this.audio.started) this.audio.bowl(undefined, undefined, 0.2);
  }

  update() {
    if (!this.active) return;
    const now = performance.now();
    const steps = PATTERNS[this.patternSel.value] || PATTERNS.calma;
    const total = steps.reduce((s, x) => s + x[1], 0);
    let t = ((now - this.cycleStart) / 1000) % total;
    let i = 0;
    while (t > steps[i][1]) { t -= steps[i][1]; i++; }
    const [name, dur, kind] = steps[i];
    const k = ease(Math.min(t / dur, 1));
    const lo = 0.35, hi = 1;
    if (kind === 'in') this.scale = lo + (hi - lo) * k;
    else if (kind === 'out') this.scale = hi - (hi - lo) * k;
    this.orb.style.transform = `scale(${this.scale.toFixed(4)})`;
    if (i !== this.lastPhase) {
      this.lastPhase = i;
      this.label.textContent = name;
    }
    this.onPulse((this.scale - lo) / (hi - lo));

    if (this.sessionEnd) {
      const left = Math.max(0, this.sessionEnd - now);
      const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      this.timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
      if (left <= 0) {
        this.sessionEnd = 0;
        this.timer.textContent = 'sessão concluída';
        if (this.audio.started) {
          this.audio.bowl(undefined, undefined, 0.22);
          setTimeout(() => this.audio.bowl(undefined, undefined, 0.16), 5000);
        }
      }
    } else if (this.timer.textContent !== 'sessão concluída') {
      this.timer.textContent = '';
    }
  }
}
