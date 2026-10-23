// Mede o tempo de quadro com a GPU de verdade, ligando e desligando cada
// recurso, para saber o que pesa. Uso: npm run bench
//   W=1440 H=900 DPR=2 npm run bench     (tamanho da janela e densidade)
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const PORTA = 5198, DEBUG = 9334;
const PERFIL = join(RAIZ, 'fotos', '.chrome-bench');
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900), DPR = Number(process.env.DPR || 2);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(existsSync);

rmSync(PERFIL, { recursive: true, force: true });
const servidor = spawn(process.execPath, [join(RAIZ, 'server.js')], { env: { ...process.env, PORT: String(PORTA) }, stdio: 'ignore' });
const chrome = spawn(CHROME, [
  '--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
  '--disable-frame-rate-limit', '--disable-gpu-vsync',
  '--mute-audio', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${PERFIL}`, `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });

let versao;
for (let i = 0; i < 60 && !versao; i++) {
  try { versao = await (await fetch(`http://127.0.0.1:${DEBUG}/json/version`)).json(); } catch { await espera(250); }
}
const ws = new WebSocket(versao.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pend = new Map();
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pend.has(msg.id)) { pend.get(msg.id)(msg); pend.delete(msg.id); }
});
const enviar = (method, params = {}, sessionId) => new Promise((ok) => { const k = ++id; pend.set(k, ok); ws.send(JSON.stringify({ id: k, method, params, sessionId })); });
const { result: { targetId } } = await enviar('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await enviar('Target.attachToTarget', { targetId, flatten: true });
const cdp = (m, p) => enviar(m, p, sessionId);
await cdp('Page.enable');
await cdp('Page.bringToFront');
await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
const avaliar = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

try {
  await cdp('Page.navigate', { url: `http://localhost:${PORTA}/?entrar&novo&hora=${process.env.HORA || "entardecer"}${process.env.AMBIENTE ? "&ambiente=" + process.env.AMBIENTE : ""}` });
  for (let i = 0; i < 120 && !(await avaliar('!!window.sereno')); i++) await espera(500);
  await espera(7000);
  const gpu = await avaliar(`(() => { const gl = sereno.engine.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })()`);
  console.log(`GPU: ${gpu}   janela ${W}x${H} @${DPR}x\n`);

  // mede no próprio laço: tempo de CPU do quadro e intervalo entre quadros
  await avaliar(`(() => {
    const e = sereno.engine;
    window.__ft = [];
    const orig = e.composer.render.bind(e.composer);
    window.__render = orig;
    let last = performance.now();
    e.composer.render = (dt) => { const t0 = performance.now(); window.__renderFn(dt); const t1 = performance.now(); window.__ft.push([t1 - t0, t0 - last]); last = t0; };
    window.__renderFn = orig;
    return true;
  })()`);

  // a resolução dinâmica fica desligada (em 1,5x) para comparar casos iguais,
  // menos no caso que mede ela
  const FIXO = `sereno.engine.governor.enabled = false; sereno.engine.setPixelRatio(sereno.engine.maxPixelRatio);`;
  const SO = (process.env.CASOS || '').split(',').filter(Boolean);
  const casosTodos = [
    ['configuração atual (1,5x fixo)', FIXO],
    ['com resolução dinâmica', `sereno.engine.governor.enabled = true;`],
    ['densidade 1x', `${FIXO} sereno.engine.setPixelRatio(1);`],
    ['sem objetos do jogador', `${FIXO} sereno.items.root.visible = false;`],
    ['sem bichos (patos, garça)', `${FIXO} for (const it of sereno.items.items) if (['patos','garca'].includes(it.type)) it.object.visible = false;`],
    ['sem patos', `${FIXO} for (const it of sereno.items.items) if (it.type === 'patos') it.object.visible = false;`],
    ['sem garca', `${FIXO} for (const it of sereno.items.items) if (it.type === 'garca') it.object.visible = false;`],
    ['sem flutuante', `${FIXO} for (const it of sereno.items.items) if (it.type === 'flutuante') it.object.visible = false;`],
    ['sem velaLotus', `${FIXO} for (const it of sereno.items.items) if (it.type === 'velaLotus') it.object.visible = false;`],
    ['sem yukimi', `${FIXO} for (const it of sereno.items.items) if (it.type === 'yukimi') it.object.visible = false;`],
    ['sem touceira', `${FIXO} for (const it of sereno.items.items) if (it.type === 'touceira') it.object.visible = false;`],
    ['sem pedraAgua', `${FIXO} for (const it of sereno.items.items) if (it.type === 'pedraAgua') it.object.visible = false;`],
    ['sem barco', `${FIXO} for (const it of sereno.items.items) if (it.type === 'barco') it.object.visible = false;`],
    ['sem salgueiros', `${FIXO} sereno.engine.scene.traverse(o => { if (o.isInstancedMesh && o.material.map === globalThis.__willowTex) o.visible = false; });`],
    ['sem reflexo da água', `${FIXO} sereno.engine.scene.traverse(o => { if (o.isReflector) o.visible = false; });`],
    ['sem sombra do sol', `${FIXO} sereno.engine.sun.castShadow = false;`],
    ['sem flores das cerejeiras', `${FIXO} sereno.engine.scene.traverse(o => { if (o.isInstancedMesh && o.material === globalThis.__sakuraFlowers) o.visible = false; });`],
    ['sem SMAA', `${FIXO} sereno.engine.smaa.enabled = false;`],
    ['sem bloom', `${FIXO} sereno.engine.bloom.enabled = false;`],
    ['rastelando sem parar', `${FIXO} (() => { const s = sereno.env.sand; let t = 0; s.rakeStart({ x: 0.1, y: 0.5 });
      window.__rake = setInterval(() => { t += 0.02; s.rakeMove({ x: 0.1 + (t % 0.8), y: 0.5 + Math.sin(t * 6) * 0.3 }); }, 16); })();`],
    ['trocando o horário', `${FIXO} sereno.tod.set('noite', 3);`],
  ];

  const casos = SO.length ? casosTodos.filter((c, i) => SO.includes(String(i))) : casosTodos;

  // cada caso é medido sozinho sobre a base (a página é recarregada)
  const medir = async () => {
    await avaliar('window.__ft = []');
    await espera(4000);
    const ft = await avaliar('window.__ft');
    const cpu = ft.map((x) => x[0]).sort((a, b) => a - b), gap = ft.slice(1).map((x) => x[1]).sort((a, b) => a - b);
    const med = (a) => a[Math.floor(a.length / 2)] || 0, p95 = (a) => a[Math.floor(a.length * 0.95)] || 0;
    return { fps: ft.length / 4, intervalo: med(gap), p95: p95(gap), max: gap[gap.length - 1] || 0, cpu: med(cpu), pr: await avaliar('sereno.engine.renderer.getPixelRatio()') };
  };
  for (const [nome, js] of casos) {
    if (true) {
      await cdp('Page.reload');
      for (let i = 0; i < 120 && !(await avaliar('!!window.sereno')); i++) await espera(500);
      await espera(7000);
      await avaliar(`(() => { const e = sereno.engine; window.__ft = []; const orig = e.composer.render.bind(e.composer); window.__renderFn = orig; let last = performance.now();
        e.composer.render = (dt) => { const t0 = performance.now(); window.__renderFn(dt); const t1 = performance.now(); window.__ft.push([t1 - t0, t0 - last]); last = t0; };
        sereno.env.kitBambooLeaf = (() => { let m = null; sereno.engine.scene.traverse(o => { if (o.isInstancedMesh && o.material.map && o.count > 20000) m = o.material.map; }); return m; })();
        ${js} return true; })()`);
      await espera(2500); // recompilação de shaders
    }
    const r = await medir();
    console.log(`${nome.padEnd(32)} ${r.fps.toFixed(0).padStart(4)} fps   quadro ${r.intervalo.toFixed(1).padStart(5)} ms   p95 ${r.p95.toFixed(1).padStart(5)}   pior ${r.max.toFixed(0).padStart(4)} ms   densidade ${r.pr}x`);
  }
} finally {
  ws.close(); chrome.kill(); servidor.kill();
}
