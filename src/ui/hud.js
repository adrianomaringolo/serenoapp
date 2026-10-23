// Interface: barra de ferramentas e catálogo, momento do dia, som, respiração,
// modo contemplação, menu e dicas. Some aos poucos quando ninguém mexe.
const ICONS = {
  pedra: '<path d="M4 17c0-4 3-8 7.5-8.5 4-.4 8.5 2.5 8.5 6.5 0 2-1.5 3-4 3H6c-1.3 0-2-.4-2-1z"/><path d="M9 12.5c1.5-.8 3-.9 4.5-.3"/>',
  pilha: '<ellipse cx="12" cy="18" rx="7" ry="2.4"/><ellipse cx="12" cy="13.2" rx="5" ry="2"/><ellipse cx="12" cy="9" rx="3.4" ry="1.6"/><ellipse cx="12" cy="5.6" rx="2" ry="1.1"/>',
  lanterna: '<path d="M7 21h10M9 21v-1.5h6V21M11 19.5V13M13 19.5V13M8 13h8M9 13V9.5h6V13M5.5 9.5h13L12 5 5.5 9.5zM12 5V3.3"/><circle cx="12" cy="11.2" r=".9"/>',
  velas: '<path d="M6 21h12M8 21v-7h3v7M13 21v-9.5h3V21"/><path d="M9.5 11.5c-.9-1-.6-2.2 0-3 .6.8.9 2 0 3zM14.5 9c-.9-1-.6-2.2 0-3 .6.8.9 2 0 3z"/>',
  pinheiro: '<path d="M12 21v-6c0-1.5-1-2.5-2.5-3"/><path d="M4 12.5c0-1.5 2-2.5 4-2.3 1-1.5 4-1.5 5 0 2.2-.3 4 .8 4 2.3 0 1-1.5 1.5-3 1.5H7c-2 0-3-.5-3-1.5zM8 7.5c0-1.2 1.6-2 3-1.8.8-1.2 3.2-1.2 4 0 1.6-.2 3 .6 3 1.8 0 .8-1.2 1.2-2.4 1.2H10.4C9 8.7 8 8.3 8 7.5z"/>',
  arbusto: '<path d="M3.5 19c0-3.5 2.5-6 5.5-6 .8-2.5 3-4 5.5-3.5 3 .5 5 3 5 6.2 0 2-1 3.3-3 3.3H5.5c-1.3 0-2-.4-2-1z"/><circle cx="9" cy="15.5" r=".8"/><circle cx="13.5" cy="13" r=".8"/><circle cx="16" cy="16.5" r=".8"/>',
  flutuante: '<path d="M7 17h10l-1-7H8l-1 7z"/><path d="M8 10h8M12 10v7"/><path d="M5 17.5h14"/><path d="M3 21c3-.8 6-.8 9 0s6 .8 9 0"/>',
  touceira: '<path d="M12 21v-7M8 21v-5M16 21v-4"/><path d="M4 13c1.5-2.5 6.5-2.5 8 0M12 12c1.5-2.5 6.5-2.5 8 0M3 15.5c1.3-2 4.7-2 5 0"/><path d="M12 9c-1.2-.8-1.5-2.5 0-4.5 1.5 2 1.2 3.7 0 4.5z"/>',
  velaLotus: '<path d="M12 8.5c-.7-.8-.5-1.8 0-2.5.5.7.7 1.7 0 2.5z"/><path d="M10.5 10h3v3h-3z"/><path d="M12 16c-2-1-3-2.5-3-4.5 1.5.5 2.5 1.5 3 3 .5-1.5 1.5-2.5 3-3 0 2-1 3.5-3 4.5zM12 16c-3.5 0-6-1-7.5-3 2.5-.3 4.5.3 6 1.6M12 16c3.5 0 6-1 7.5-3-2.5-.3-4.5.3-6 1.6"/><path d="M3 20c3-.8 6-.8 9 0s6 .8 9 0"/>',
  pedraAgua: '<path d="M5 16c0-3.5 3-6.5 7-6.5s7 3 7 6.5"/><path d="M8 11.5c1.2-1 2.6-1.3 4-1"/><path d="M2.5 16.5c3-.8 6-.8 9.5 0s6.5.8 9.5 0M4 20c2.7-.6 5.3-.6 8 0s5.3.6 8 0"/>',
  yukimi: '<path d="M3.5 10.5h17L12 6.5z"/><path d="M12 6.5V4.5"/><path d="M9 10.5h6v3.5H9z"/><path d="M8.5 14l-2.5 5M15.5 14l2.5 5M12 14v5"/><path d="M3 20.5c3-.6 6-.6 9 0s6 .6 9 0"/>',
  patos: '<path d="M4 15c0-2 1.5-3 3.5-3h3c1 0 1.5-.8 1.5-2 0-1.4 1-2.5 2.5-2.5S17 8.6 17 10v.5l2.5.5-2.5.8c-.3 2.2-2 3.2-4 3.2H6"/><circle cx="15" cy="9.8" r=".5"/><path d="M3 18.5c3-.8 6-.8 9 0s6 .8 9 0"/>',
  garca: '<path d="M10.5 21l1-6M13.5 21l-.5-6"/><path d="M8 11c0-2.5 2-4 4.5-4h1c0-2 .5-3 2-3 1 0 1.5.6 1.5 1.3l3 .4-3 .6c-.5 1.5-2 1.5-2 3.2 0 3-2 4.5-4.5 4.5H11c-1.8 0-3-1.2-3-3z"/><path d="M4 21h16"/>',
  barco: '<path d="M2.5 13.5c3 3 6 4 9.5 4s6.5-1 9.5-4z"/><path d="M6 13.5h12M15 13.5l3.5-6"/><path d="M3 21c3-.8 6-.8 9 0s6 .8 9 0"/>',
  lotus: '<path d="M12 18c-2.5-1.5-3.5-4-3-7.5 1.8 1 3 2.4 3 4.5 0-2.1 1.2-3.5 3-4.5.5 3.5-.5 6-3 7.5z"/><path d="M12 18c-3.5 0-6.5-1.5-8-4.5 2.5-.5 4.5 0 6 1.5M12 18c3.5 0 6.5-1.5 8-4.5-2.5-.5-4.5 0-6 1.5M12 10.5c-.5-2 0-4 0-5.5 0 1.5.5 3.5 0 5.5"/><path d="M3 21c3-.8 6-.8 9 0s6 .8 9 0"/>',
};

const HINTS = {
  move: 'Arraste os objetos para mudá-los de lugar',
  rake: 'Desenhe sulcos na areia, devagar',
  place: 'Toque onde quer colocar',
  placeWater: 'A lótus flutua no lago — toque na água',
};

export class Hud {
  constructor({ env, environments, interaction, audio, timeOfDay, breathing, engine, actions }) {
    this.root = document.getElementById('hud');
    this.env = env;
    this.interaction = interaction;
    this.audio = audio;
    this.tod = timeOfDay;
    this.breathing = breathing;
    this.engine = engine;
    this.actions = actions;
    const $ = (id) => document.getElementById(id);
    this.$ = $;

    $('env-name').textContent = env.name;
    // ambiente sem areia: sem rastelo
    if (!env.sand) {
      this.root.querySelector('.tool[data-mode="rake"]').hidden = true;
      $('btn-rerake').hidden = true;
    }

    // ferramentas
    this.toolBtns = [...this.root.querySelectorAll('.tool')];
    this.toolBtns.forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode)));

    // catálogo
    const cat = $('catalog');
    this.itemBtns = [];
    for (const [type, def] of Object.entries(env.catalog)) {
      const b = document.createElement('button');
      b.className = 'item';
      b.title = def.label;
      b.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[type] || ICONS.pedra}</svg><span>${def.short || def.label.split(' ')[0]}</span>`;
      b.addEventListener('click', () => {
        if (b.classList.contains('active')) {
          interaction.cancelPlacing();
          this.refreshTools();
          return;
        }
        if (interaction.startPlacing(type) === false) return;
        this.itemBtns.forEach((x) => x.classList.toggle('active', x === b));
        this.toolBtns.forEach((x) => x.classList.remove('active'));
        this.hint(def.surface === 'water' ? HINTS.placeWater : HINTS.place, 4000);
      });
      cat.appendChild(b);
      this.itemBtns.push(b);
    }

    // seleção
    $('btn-rot-l').addEventListener('click', () => interaction.rotateSelected(-1));
    $('btn-rot-r').addEventListener('click', () => interaction.rotateSelected(1));
    $('btn-remove').addEventListener('click', () => interaction.removeSelected());

    // momento do dia
    $('btn-time').addEventListener('click', () => this.nextTime());
    this.updateTimeLabel();

    // som
    const popSound = $('pop-sound'), popMenu = $('pop-menu'), popView = $('pop-view');
    const pops = [popSound, popMenu, popView];
    const toggle = (pop) => { pops.forEach((p) => { if (p !== pop) p.hidden = true; }); pop.hidden = !pop.hidden; };
    $('btn-sound').addEventListener('click', (e) => { e.stopPropagation(); toggle(popSound); });
    $('btn-menu').addEventListener('click', (e) => { e.stopPropagation(); toggle(popMenu); });
    $('btn-view').addEventListener('click', (e) => { e.stopPropagation(); toggle(popView); });
    pops.forEach((p) => p.addEventListener('pointerdown', (e) => e.stopPropagation()));
    addEventListener('pointerdown', () => pops.forEach((p) => { p.hidden = true; }));
    $('vol-music').value = audio.levels.music;
    $('vol-nature').value = audio.levels.nature;
    $('vol-noise').value = audio.levels.noise;
    $('vol-music').addEventListener('input', (e) => { audio.setLevels({ music: +e.target.value }); actions.saveSettings(); });
    $('vol-nature').addEventListener('input', (e) => { audio.setLevels({ nature: +e.target.value }); actions.saveSettings(); });
    $('vol-noise').addEventListener('input', (e) => { audio.setLevels({ noise: +e.target.value }); actions.saveSettings(); });
    $('btn-mute').addEventListener('click', () => this.toggleMute());
    this.syncMute();

    // respiração
    $('btn-breathe').addEventListener('click', () => this.toggleBreath());
    breathing.onToggle = (on) => $('btn-breathe').classList.toggle('on', on);

    // modo foto e galeria (ligados pelo main.js)
    $('btn-photo').addEventListener('click', () => this.photo?.enter());
    $('btn-gallery').addEventListener('click', () => this.gallery?.open());

    // contemplação
    $('btn-zen').addEventListener('click', () => this.setZen(true));

    // menu
    const list = $('env-list');
    for (const e of environments) {
      const b = document.createElement('button');
      b.className = 'env-item' + (e.id === env.id ? ' current' : '');
      b.innerHTML = `<b>${e.name}</b><small>${e.description || ''}</small>`;
      b.addEventListener('click', () => actions.switchEnv(e.id));
      list.appendChild(b);
    }
    $('btn-rerake').addEventListener('click', () => { actions.rerake(); popMenu.hidden = true; });
    $('btn-reset').addEventListener('click', () => { actions.reset(); popMenu.hidden = true; });
    $('btn-help').addEventListener('click', () => { $('help').hidden = false; popMenu.hidden = true; });
    $('help-close').addEventListener('click', () => { $('help').hidden = true; actions.saveSettings({ helpSeen: true }); });

    // teclado
    addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, select, textarea')) return;
      const k = e.key.toLowerCase();
      if (this.photo?.active || this.gallery?.isOpen) return;
      if (k === 'f') { this.photo?.enter(); return; }
      if (k === 'g') { this.gallery?.open(); return; }
      if (this.zen) { if (k === 'escape' || k === 'z') this.setZen(false); return; }
      if (k === 'm') this.setMode('move');
      else if (k === 'r' && this.env.sand) this.setMode('rake');
      else if (k === 't') this.nextTime();
      else if (k === 'b') this.toggleBreath();
      else if (k === 'z') this.setZen(true);
    });

    // some quando ninguém mexe
    this.lastActivity = performance.now();
    const wake = () => {
      this.lastActivity = performance.now();
      this.root.classList.remove('idle');
    };
    addEventListener('pointermove', wake, { passive: true });
    addEventListener('pointerdown', wake, { passive: true });
    addEventListener('keydown', wake);

    // sair da contemplação com um toque
    document.getElementById('scene').addEventListener('pointerup', () => {
      if (this.zen && performance.now() - this.zenSince > 600) this.setZen(false);
    });
  }

  // contador "12 / 40" no fim do catálogo; fica âmbar perto do limite
  updateCount() {
    const items = this.interaction.items;
    const el = this.$('item-count');
    if (!el) return;
    const n = items.count, max = items.limits.total;
    el.textContent = `${n} / ${max}`;
    el.classList.toggle('near', n >= max * 0.85);
    el.classList.toggle('full', n >= max);
    el.title = `Objetos no cenário: ${n} de ${max}`;
  }

  show() {
    this.root.classList.remove('hidden');
  }

  setMode(mode) {
    this.interaction.setMode(mode);
    this.refreshTools();
    this.hint(HINTS[mode], 3500);
  }

  refreshTools() {
    this.updateCount();
    const mode = this.interaction.placing ? null : this.interaction.mode;
    this.toolBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    this.itemBtns.forEach((b) => { if (!this.interaction.placing) b.classList.remove('active'); });
  }

  onSelect(item) {
    const el = this.$('selection');
    if (!item) {
      el.hidden = true;
      this.refreshTools();
      return;
    }
    this.$('sel-name').textContent = item.def.label;
    el.hidden = false;
    this.refreshTools();
  }

  nextTime() {
    this.tod.next();
    this.updateTimeLabel();
    this.actions.saveSettings();
  }

  updateTimeLabel() {
    const p = this.tod.presets[this.tod.name];
    this.$('time-label').textContent = p.label;
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    this.syncMute();
    this.actions.saveSettings();
  }

  syncMute() {
    this.$('btn-sound').classList.toggle('muted', this.audio.muted);
    this.$('btn-mute').textContent = this.audio.muted ? 'Ligar o som' : 'Silenciar tudo';
  }

  toggleBreath() {
    this.breathing.toggle();
  }

  setZen(on) {
    this.zen = on;
    this.zenSince = performance.now();
    document.body.classList.toggle('zen', on);
    this.root.classList.toggle('hidden', on);
    this.engine.controls.autoRotate = on;
    this.interaction.select(null);
    if (on) {
      const ex = this.$('zen-exit');
      ex.hidden = false;
      ex.style.animation = 'none';
      void ex.offsetWidth;
      ex.style.animation = '';
    } else {
      this.$('zen-exit').hidden = true;
    }
  }

  hint(text, ms = 3000) {
    const el = this.$('hint');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  update() {
    const popOpen = this.root.querySelector('.pop:not([hidden])');
    if (popOpen) this.root.classList.remove('idle');
    if (!this.zen && !popOpen && performance.now() - this.lastActivity > 9000 && !this.interaction.placing) {
      this.root.classList.add('idle');
    }
  }
}
