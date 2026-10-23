# Sereno

Ambientes de meditação interativos em three.js. Cada ambiente é um lugar
bonito e calmo, com trilha sonora gerada na hora, onde dá para mexer no
cenário — mover pedras, colocar velas, rastelar a areia — sem pressa e sem
objetivo.

Ambientes (escolha na tela inicial, troca pelo menu `···`, ou `?ambiente=<id>` na URL):

- **Jardim Zen** (`jardim-zen`) — um karesansui (jardim de areia rastelada
  com ilhas de pedra e musgo) diante de um deck de madeira, um lago de carpas
  com shishi-odoshi, um bordo japonês vermelho, o bambuzal ao fundo e
  montanhas na névoa.
- **Lago de Lótus** (`lago-lotus`) — um lago espelhado ao amanhecer, com
  passarela em zigue-zague até um pavilhão sobre palafitas, touceiras de
  lótus, libélulas, salgueiros, cerejeiras e uma floresta de cedros
  refletida na água. Na água dá para pôr lanternas de papel e velas de lótus
  (que derivam devagar), touceiras de lótus, vitórias-régias, pedras, uma
  lanterna de pedra de lago (yukimi-dōrō), um casal de patos-mandarim (que
  nada sozinho), uma garça e um barquinho.
- **Floresta de Musgo** (`floresta-musgo`) — uma floresta antiga e úmida
  (como Yakushima): um riacho desce o vale em degraus, de poço em poço, com
  pequenas cascatas espumando entre pedras cobertas de musgo; cedros
  milenares de raízes agarradas ao chão, samambaias, troncos caídos, uma
  ponte de troncos e pedras de travessia. De manhã o sol entra em raios pela
  névoa; à noite os vaga-lumes sobem do riacho e os cogumelos brilham de leve.
  Lanternas de papel e barquinhos soltos na água descem a correnteza (e
  contornam as pedras) até girar devagar no poço.
- **Caminho das Cerejeiras** (`cerejeiras`) — primavera, hanami: um canal
  estreito de paredes de pedra (como o Caminho do Filósofo, em Quioto) corre
  entre duas fileiras de sakuras velhas que se debruçam sobre a água e fecham
  um túnel de flores. As pétalas caem o tempo todo, pousam no caminho de
  pedrisco ou boiam em jangadas (hanaikada) que descem o canal. Uma ponte
  laqueada leva a um torii, e degraus de pedra sobem a colina da grande
  cerejeira-chorona. À noite as bonbori acendem as flores por baixo
  (yozakura). **Tocar uma cerejeira faz chover pétalas.** Dá para pôr bonbori,
  tapete de piquenique com chá e dango, guarda-sol de papel, cerejeiras
  jovens, lanternas e, na água, lanternas flutuantes e barquinhos. A trilha
  usa a escala de "Sakura Sakura" (miyako-bushi).

## Rodar

```bash
npm install
npm start          # http://localhost:5173
```

Não há etapa de build: o `index.html` carrega os módulos direto, e o
importmap aponta o `three` para `node_modules/`.

Parâmetros de URL úteis:

| URL | Efeito |
| --- | --- |
| `?hora=noite` | começa em `amanhecer`, `dia`, `entardecer` ou `noite` |
| `?novo` | ignora o jardim salvo (começa do jardim original) |
| `?entrar` | pula a tela de abertura |

`npm run foto` tira fotos num Chrome sem janela (veja `scripts/foto.js`) — é
o jeito rápido de conferir o visual depois de mexer em modelos ou luz:

`npm run bench` mede o desempenho com a GPU de verdade (fps, pior quadro)
ligando e desligando cada recurso.

```bash
npm run foto -- --todos                     # os quatro momentos do dia
npm run foto -- noite --js "sereno.engine.camera.position.set(-6,3,9)"
```

## Como se interage

- **Olhar em volta** — arrastar no cenário; roda/pinça aproxima.
- **Mover** — arrastar um objeto; rodinha ou `Q`/`E` gira; `Delete` remove.
- **Adicionar** — escolher na barra de baixo e tocar onde colocar. A lótus só
  flutua no lago.
- **Rastelar** (`R`) — desenhar sulcos na areia.
- **Água e bambu** — tocar o lago faz ondas (e as carpas vêm ver); tocar o
  shishi-odoshi faz ele virar.
- **Momento do dia** (`T`), **respiração guiada** (`B`), **contemplar** (`Z`:
  some a interface e a câmera gira devagar).

- **Ponto de vista** (bússola) — pontos de vista prontos de cada ambiente (a
  câmera voa até lá), também marcados no cenário por pontos de luz clicáveis
  (opcionais: `viewpoints[].marker` define onde o ponto flutua); **dois cliques/toques** em qualquer lugar recentralizam a
  órbita ali; **caminhar** (`C`): na altura dos olhos, seguindo terreno, deck,
  passarela e pavilhão, com passos; não entra na água nem pisa na areia
  rastelada. `Esc` volta a orbitar.
- **Modo foto** (`F`) — câmera livre (arrastar olha; WASD/setas andam; Q/E
  ou Ctrl/Espaço descem e sobem; Shift acelera; rodinha avança; no toque, um
  dedo olha, dois deslizam, pinça avança). Lente 14–200 mm, toque para focar,
  abertura f/1.4–f/16 (desfoque de lente real), exposição, horizonte, grade
  de terços, pausar o tempo e trocar o horário. `Enter` fotografa.
- **Galeria** (`G`) — as fotos (3840 px, JPEG) ficam no IndexedDB do navegador,
  só neste aparelho; dá para ver, baixar, compartilhar e apagar.

O jardim (objetos e areia) e as preferências ficam salvos no `localStorage`.

## Arquitetura

```
src/
  main.js                  liga tudo: motor, ambiente, objetos, interface
  core/                    o que vale para qualquer ambiente
    engine.js              renderer, câmera, pós-processamento, sol, laço
    sky.js                 céu em shader (degradê, sol/lua, nuvens, estrelas)
    timeOfDay.js           momentos do dia e a transição entre eles
    mirrorWater.js         água espelhada (reflexo real em meia resolução)
    lightPool.js           poucas luzes pontuais emprestadas às mais próximas
    resolution.js          resolução dinâmica (ajusta a densidade de pixels ao fps)
    freeCamera.js          câmera livre do modo foto
    walkCamera.js          caminhar na altura dos olhos
    photoStore.js          galeria local (IndexedDB)
    materials.js           triplanar, vento na GPU, bakeGroup
    textures.js / noise.js texturas procedurais (nada de arquivo de imagem)
    sand.js                areia rastelável (canvas de altura → relevo)
    atmosphere.js          vaga-lumes, névoa e raios de sol entre as copas
    audio.js               trilha generativa e efeitos (Web Audio)
    items.js               objetos móveis: criar, animar, salvar
    interaction.js         arrastar, colocar, rastelar, tocar
  models/                  modelos procedurais reaproveitáveis (stream.js: riacho
                           em degraus; forest.js: cedro milenar, samambaia…;
                           sakura.js: cerejeiras, pétalas caindo e boiando;
                           hanami.js: bonbori, torii, ponte em arco, piquenique)
  environments/
    index.js               lista de ambientes
    jardim-zen/index.js    o Jardim Zen
    lago-lotus/index.js    o Lago de Lótus
    floresta-musgo/index.js a Floresta de Musgo
    cerejeiras/index.js    o Caminho das Cerejeiras
  ui/                      HUD, respiração guiada, modo foto e galeria
```

Tudo é procedural: geometria, texturas e som saem de ruído com semente, então
a mesma pedra salva volta igual ao recarregar, e o download é só código.

### Criar um ambiente novo

1. Crie `src/environments/<id>/index.js` exportando
   `{ id, name, description, defaultTime?, presets?, build }`. `presets`
   muda os momentos do dia só neste ambiente (ex.: a floresta tem névoa mais
   densa e o sol mais alto: `{ amanhecer: { fogDensity: 0.017, sunDir } }`).
2. `build({ engine, audio, tick })` monta a cena em `engine.scene` e devolve:

   | Campo | Para quê |
   | --- | --- |
   | `catalog` | `{ tipo: { label, surface: 'ground' \| 'water', create(seed, opts), sound } }` |
   | `defaultItems` | jardim inicial: `[{ type, x, z, rot, seed, opts }]` |
   | `pickSurface(ray)` | onde o ponteiro bate: `{ p, kind, uv? }` |
   | `surfaceHeight(x, z, surface)` / `accepts(hit, def)` | onde um objeto pode ficar |
   | `applyTime(state)` / `update(dt, t)` | reagir ao momento do dia / animar |
   | `sand`, `sandCenters` | opcionais, se houver areia rastelável |
   | `clickables`, `onWaterClick` | opcionais |
   | `mood` | tônica e escala da trilha (`{ root: 'D', scale: [0,2,4,7,9] }`) |
   | `camera` | posição e alvo iniciais |
| `attachItems(items)` | opcional: recebe o ItemManager (ex.: lanternas que derivam) |
| `standAt(x, z)` | caminhar: `{ y, kind }` onde dá para pisar (`kind`: som do passo), `null` onde não |
| `walkStart`, `viewpoints` | onde a caminhada começa; pontos de vista prontos `[{ name, position, target }]` |
| `limits` | `{ total, perType }`: quantos objetos o jogador pode pôr |

Um modelo pode se animar sozinho declarando `userData.animate(dt, t)`; o
`ItemManager` chama a cada quadro (patos, garça).

3. Registre em `src/environments/index.js`.
4. Tire a capa da tela inicial — a única imagem do projeto, só da interface:
   `AMBIENTE=<id> NOME=capa-<id> npm run foto -- <hora> --js "document.getElementById('hud').style.display='none'; document.getElementById('vp-label').style.display='none'"`
   e converta para `img/ambientes/<id>.jpg` com 640 px de largura
   (`sips -s format jpeg -s formatOptions 82 -Z 640 fotos/capa-<id>.png --out img/ambientes/<id>.jpg`).

Ambientes de copa alta podem afastar o sol (`engine.sunDistance`) para a
câmera de sombra alcançar as copas; `audio.setEnvironment({ water })` deixa a
água corrente mais alta ou mais baixa, e `{ cascade }` (0–1) liga o som de
uma cascata pequena (queda + borbulhar), que a floresta aumenta conforme a
câmera chega perto das quedas.

Modelos novos vão em `src/models/` e usam os materiais compartilhados de
`models/kit.js` — uma luz de objeto (vela, lanterna) é só declarar
`userData.lights` no grupo que o `ItemManager` cuida do resto.
