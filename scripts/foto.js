// Tira fotos do jogo num Chrome sem janela — para conferir o visual sem abrir
// o navegador. Sai em fotos/<hora>.png e mostra no terminal os erros do console.
//
// Uso: npm run foto                       (entardecer)
//      npm run foto -- noite amanhecer    (vários momentos)
//      npm run foto -- --todos
//      npm run foto -- --js "sereno.engine.camera.position.set(-6,3,9)"
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const PORTA = 5199, DEBUG = 9333;
const PERFIL = join(RAIZ, 'fotos', '.chrome');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const jsIdx = args.indexOf('--js');
const extraJs = jsIdx >= 0 ? args.splice(jsIdx, 2)[1] : '';
const largura = Number(process.env.W || 1280), altura = Number(process.env.H || 800);
let horas = args.filter((a) => !a.startsWith('--'));
if (args.includes('--todos')) horas = ['amanhecer', 'dia', 'entardecer', 'noite'];
if (!horas.length) horas = ['entardecer'];

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
].find(existsSync);

async function abrirChrome() {
  rmSync(PERFIL, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--hide-scrollbars', '--mute-audio', '--no-first-run', '--disable-extensions',
    '--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${PERFIL}`,
    `--window-size=${largura},${altura}`, 'about:blank',
  ], { stdio: 'ignore' });
  let versao;
  for (let i = 0; i < 60; i++) {
    try { versao = await (await fetch(`http://127.0.0.1:${DEBUG}/json/version`)).json(); break; } catch { await espera(250); }
  }
  if (!versao) throw new Error('o Chrome não abriu a porta do DevTools');
  const ws = new WebSocket(versao.webSocketDebuggerUrl);
  await new Promise((r, e) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', e, { once: true }); });
  let id = 0;
  const pend = new Map();
  const logs = [];
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      logs.push(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') logs.push('[exceção] ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    if (!msg.id || !pend.has(msg.id)) return;
    const { ok, falha } = pend.get(msg.id);
    pend.delete(msg.id);
    msg.error ? falha(new Error(msg.error.message)) : ok(msg.result);
  });
  const enviar = (method, params = {}, sessionId) => new Promise((ok, falha) => {
    const meu = ++id;
    pend.set(meu, { ok, falha });
    ws.send(JSON.stringify({ id: meu, method, params, sessionId }));
  });
  const { targetId } = await enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await enviar('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (m, p) => enviar(m, p, sessionId);
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  // aba em primeiro plano: sem isso o headless pausa o requestAnimationFrame
  await cdp('Page.bringToFront');
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: 1, mobile: false });
  return { cdp, logs, fechar: () => { try { ws.close(); } catch { /* já foi */ } chrome.kill(); } };
}

const servidor = spawn(process.execPath, [join(RAIZ, 'server.js')], { env: { ...process.env, PORT: String(PORTA), ...(process.env.DIST ? { ROOT: join(RAIZ, 'dist') } : {}) }, stdio: 'ignore' });
mkdirSync(join(RAIZ, 'fotos'), { recursive: true });
const { cdp, logs, fechar } = await abrirChrome();
const avaliar = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;

try {
  for (const hora of horas) {
    await cdp('Page.navigate', { url: `http://localhost:${PORTA}/?entrar${process.env.MANTER ? "" : "&novo"}&hora=${hora}${process.env.AMBIENTE ? "&ambiente=" + process.env.AMBIENTE : ""}` });
    for (let i = 0; i < 120 && !(await avaliar('!!window.sereno')); i++) await espera(500);
    if (!(await avaliar('!!window.sereno'))) throw new Error('o jogo não terminou de carregar');
    await espera(7000); // câmera de entrada + mapa de ambiente
    if (extraJs) {
      await avaliar(extraJs);
      await espera(1500);
      const res = await avaliar('JSON.stringify(window.__res ?? null)');
      if (res && res !== 'null') console.log('resultado:', res);
    }
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
    const arq = join(RAIZ, "fotos", `${process.env.NOME || hora + (extraJs ? "-js" : "")}.png`);
    writeFileSync(arq, Buffer.from(data, 'base64'));
    console.log('📷', arq);
  }
} finally {
  if (logs.length) console.log(logs.join('\n'));
  fechar();
  servidor.kill();
}
