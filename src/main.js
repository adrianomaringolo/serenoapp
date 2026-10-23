// Sereno — ponto de entrada. Monta o motor, carrega o ambiente, restaura o
// jardim salvo e liga interface, som e interação.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { TimeOfDay, withPresets } from './core/timeOfDay.js';
import { SoundEngine } from './core/audio.js';
import { ItemManager } from './core/items.js';
import { Interaction } from './core/interaction.js';
import * as store from './core/storage.js';
import { Hud } from './ui/hud.js';
import { Breathing } from './ui/breathing.js';
import { Gallery } from './ui/gallery.js';
import { PhotoMode } from './ui/photoMode.js';
import { ViewMode } from './ui/viewMode.js';
import { ENVIRONMENTS, DEFAULT_ENVIRONMENT } from './environments/index.js';

const params = new URLSearchParams(location.search);
const bar = document.getElementById('intro-bar');
const enter = document.getElementById('intro-enter');

async function main() {
  const settings = store.load('settings', {});
  const envId = params.get('ambiente') || settings.env || DEFAULT_ENVIRONMENT;
  const envDef = ENVIRONMENTS.find((e) => e.id === envId) || ENVIRONMENTS[0];
  showEnvChoice(envDef, settings);

  const engine = new Engine(document.getElementById('scene'));
  const audio = new SoundEngine();
  if (settings.levels) audio.levels = { ...audio.levels, ...settings.levels };
  if (settings.muted) audio.muted = true;

  const tod = new TimeOfDay(withPresets(envDef.presets));
  engine.timeOfDay = tod;
  // cada ambiente lembra o próprio horário (e tem um preferido na primeira vez)
  const initialTime = params.get('hora') || settings.times?.[envDef.id] || envDef.defaultTime || 'entardecer';
  tod.set(tod.presets[initialTime] ? initialTime : 'entardecer', 0);

  // carregamento em etapas, deixando a barra andar
  const steps = ['texturas', 'terreno', 'jardim', 'lago', 'árvores', 'grama'];
  const tick = async (label) => {
    const i = steps.indexOf(label);
    bar.style.width = `${Math.round(((i + 1) / (steps.length + 1)) * 100)}%`;
    await new Promise((r) => setTimeout(r, 0));
  };
  const env = await envDef.build({ engine, audio, tick });
  audio.setMood(env.mood);
  engine.camera.position.copy(env.camera.position);
  engine.controls.target.copy(env.camera.target);
  if (innerWidth < innerHeight) {
    // retrato: mais perto e olhando um pouco mais para baixo
    engine.controls.target.y -= 0.7;
    engine.camera.position.lerp(engine.controls.target, 0.1);
  }

  // objetos
  const items = new ItemManager({
    scene: engine.scene, catalog: env.catalog, lightPool: engine.lightPool, surfaceHeight: env.surfaceHeight, limits: env.limits,
  });
  const saveKey = `jardim:${env.id}`;
  const saved = params.has('novo') ? null : store.load(saveKey);
  items.load(saved?.items || env.defaultItems);
  env.attachItems?.(items);

  const sandCentersFromItems = () => env.sandCenters?.([...items.items].filter((i) => !i.removing).map((i) => ({
    x: i.target.x, z: i.target.z, r: (i.object.userData.radius || 0.5) * 0.9,
  })));
  let sandRestored = false;
  if (env.sand) {
    if (saved?.sand) sandRestored = await env.sand.restore(saved.sand);
    if (!sandRestored) env.sand.drawClassic(sandCentersFromItems());
  }

  // salvar (com calma: o mapa da areia só é recodificado quando mudou)
  let saveTimer = null, sandDirty = false;
  let sandData = saved?.sand || null;
  const persist = () => {
    if (sandDirty && env.sand) { sandData = env.sand.serialize(); sandDirty = false; }
    store.save(saveKey, { v: 1, items: items.serialize(), sand: sandData });
  };
  const scheduleSave = (opts = {}) => {
    if (opts.sand) sandDirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 900);
  };
  const saveSettings = (extra = {}) => {
    settings.times = { ...(settings.times || {}), [env.id]: tod.name };
    Object.assign(settings, { env: env.id, levels: audio.levels, muted: audio.muted }, extra);
    store.save('settings', settings);
  };

  // interação e interface
  let hud = null;
  const interaction = new Interaction({
    engine, env, items, audio,
    onChange: (opts) => { scheduleSave(opts); hud?.updateCount(); },
    onSelect: (it) => hud?.onSelect(it),
  });
  const breathing = new Breathing({ audio });
  hud = new Hud({
    env, environments: ENVIRONMENTS, interaction, audio, timeOfDay: tod, breathing, engine,
    actions: {
      saveSettings,
      switchEnv: (id) => {
        if (id === env.id) return;
        persist();
        saveSettings({ env: id });
        settings.env = id;
        store.save('settings', settings);
        const url = new URL(location.href);
        url.searchParams.delete('ambiente');
        url.searchParams.delete('novo');
        location.href = url.toString();
      },
      rerake: () => { if (!env.sand) return; env.sand.drawClassic(sandCentersFromItems()); scheduleSave({ sand: true }); audio.rake(0); },
      reset: () => {
        items.load(env.defaultItems);
        env.sand?.drawClassic(sandCentersFromItems());
        scheduleSave({ sand: !!env.sand });
      },
    },
  });
  // modo foto e galeria
  const gallery = new Gallery();
  const photo = new PhotoMode({ engine, env, tod, audio, hud, interaction, breathing, gallery });
  hud.photo = photo;
  const view = new ViewMode({ engine, env, audio, hud, interaction });
  hud.view = view;
  // o modo foto parte da órbita: sai da caminhada antes
  const enterPhoto = photo.enter.bind(photo);
  photo.enter = () => { if (view.walking) view.setWalking(false); enterPhoto(); };
  interaction.onLimit = (msg) => { hud.hint(msg, 4500); hud.refreshTools(); };
  hud.updateCount();
  hud.gallery = gallery;

  // depois de colocar um objeto, a barra volta para "mover"
  const origCommit = interaction.commitPlacing.bind(interaction);
  interaction.commitPlacing = () => { origCommit(); hud.refreshTools(); };

  // aplicar o momento do dia
  const applyTime = () => {
    engine.applyTime(tod.current);
    env.applyTime(tod.current);
  };
  applyTime();

  engine.onUpdate((dt, t) => {
    if (tod.update(dt)) applyTime();
    env.update(dt, t);
    items.update(dt, t);
    interaction.update(dt, t);
    breathing.update();
    hud.update();
  });

  // pré-compila os shaders antes de mostrar (evita engasgos no primeiro quadro)
  // Um exemplar de cada objeto do catálogo entra na compilação, escondido
  // embaixo do chão: sem isso, colocar a primeira vela/lótus/pinheiro
  // compilava os shaders dele na hora e a tela engasgava.
  engine.prepareEnvironments(tod);
  const warm = new THREE.Group();
  warm.position.set(0, -30, 0);
  for (const def of Object.values(env.catalog)) warm.add(def.create(1, {}));
  engine.scene.add(warm);
  engine.renderer.compile(engine.scene, engine.camera);
  engine.scene.remove(warm);
  engine.start();
  bar.style.width = '100%';

  // entrada: câmera chega devagar enquanto a abertura se dissolve
  const intro = document.getElementById('intro');
  const finalPos = engine.camera.position.clone();
  engine.camera.position.copy(finalPos).add(new THREE.Vector3(0, 4, 9));
  enter.disabled = false;
  enter.textContent = 'Entrar';

  const begin = async () => {
    enter.disabled = true;
    try { await audio.start(); } catch (e) { console.warn('áudio indisponível', e); }
    intro.classList.add('leaving');
    const from = engine.camera.position.clone();
    const t0 = performance.now();
    const off = engine.onUpdate(() => {
      const k = Math.min((performance.now() - t0) / 5000, 1);
      const e = 1 - Math.pow(1 - k, 3);
      engine.camera.position.lerpVectors(from, finalPos, e);
      if (k >= 1) off();
    });
    setTimeout(() => {
      intro.remove();
      hud.show();
      if (!settings.helpSeen) {
        hud.hint('Arraste para olhar · arraste uma pedra para movê-la', 6000);
      }
    }, 1800);
  };
  enter.addEventListener('click', begin, { once: true });
  if (params.has('entrar')) begin();

  // atalhos para testes no console
  window.sereno = { engine, env, items, interaction, audio, tod, hud, THREE };
}

// Abertura: um cartão por ambiente, com a foto dele. O escolhido é o que está
// carregando; trocar recarrega a página com o outro (como no menu "Ambientes").
function showEnvChoice(current, settings) {
  const list = document.getElementById('intro-envs');
  const desc = document.getElementById('intro-env-desc');
  desc.textContent = current.description;
  for (const e of ENVIRONMENTS) {
    const card = document.createElement('button');
    card.className = 'intro-env' + (e.id === current.id ? ' on' : '');
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', String(e.id === current.id));
    card.title = e.description;
    card.innerHTML = `<img src="./img/ambientes/${e.id}.jpg" alt="" loading="eager" /><span></span>`;
    card.querySelector('span').textContent = e.name;
    card.addEventListener('click', () => {
      if (e.id === current.id || list.classList.contains('switching')) return;
      list.classList.add('switching');
      list.querySelector('.on')?.classList.remove('on');
      card.classList.add('on');
      desc.textContent = e.description;
      store.save('settings', { ...settings, env: e.id });
      const url = new URL(location.href);
      url.searchParams.delete('ambiente');
      url.searchParams.delete('novo');
      // deixa a escolha assentar antes de recarregar
      setTimeout(() => { location.href = url.toString(); }, 450);
    });
    list.append(card);
  }
}

main().catch((err) => {
  console.error(err);
  enter.textContent = 'Não foi possível abrir o jardim';
  const p = document.createElement('p');
  p.className = 'intro-tip';
  p.textContent = String(err?.message || err);
  enter.after(p);
});
