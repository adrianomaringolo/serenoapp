// Monta dist/ para publicar: o jogo + só os arquivos do three.js que ele usa
// (seguindo os imports), em vendor/. Uso: npm run dist
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const DIST = join(RAIZ, 'dist');
const THREE = join(RAIZ, 'node_modules', 'three');
const ADDONS = join(THREE, 'examples', 'jsm');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
for (const f of ['index.html', 'style.css']) cpSync(join(RAIZ, f), join(DIST, f));
cpSync(join(RAIZ, 'src'), join(DIST, 'src'), { recursive: true });
cpSync(join(RAIZ, 'img'), join(DIST, 'img'), { recursive: true });

const importsOf = (file) => [...readFileSync(file, 'utf8').matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] || m[2]);

// addons usados pelo jogo
const pending = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) for (const s of importsOf(p)) if (s.startsWith('three/addons/')) pending.push(join(ADDONS, s.slice('three/addons/'.length)));
  }
};
walk(join(RAIZ, 'src'));

// fecha o grafo: addons importam outros addons por caminho relativo
const seen = new Set();
while (pending.length) {
  const file = pending.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  for (const s of importsOf(file)) if (s.startsWith('.')) pending.push(resolve(dirname(file), s));
}
for (const file of seen) {
  const out = join(DIST, 'vendor', 'addons', relative(ADDONS, file));
  mkdirSync(dirname(out), { recursive: true });
  cpSync(file, out);
}
mkdirSync(join(DIST, 'vendor'), { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) cpSync(join(THREE, 'build', f), join(DIST, 'vendor', f));

// importmap aponta para vendor/
const html = readFileSync(join(DIST, 'index.html'), 'utf8')
  .replace('./node_modules/three/build/three.module.js', './vendor/three.module.js')
  .replace('./node_modules/three/examples/jsm/', './vendor/addons/');
writeFileSync(join(DIST, 'index.html'), html);
console.log(`dist/ pronto: ${seen.size} addons do three`);
