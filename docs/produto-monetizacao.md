# Sereno como produto — distribuição e monetização

Registro das possibilidades estudadas para transformar o Sereno num produto.
Nada aqui está decidido; é o mapa para decidir.

## Princípio que guia tudo

O Sereno vende **calma**. Qualquer forma de ganhar dinheiro tem que respeitar
isso: nada de anúncios, contagens regressivas, avisos insistentes ou telas que
apressam. A cobrança aparece com a mesma calma do resto da interface.

**Anúncios estão descartados**: quebram a experiência e afastam justamente o
público que paga por apps de bem-estar.

## Onde o Sereno vai morar

- **Hoje (teste):** here.now, endereço provisório. Serve só para testar.
- **Produção:** Vercel com **domínio próprio**.
  - O site é estático: na Vercel, comando de build `npm run dist` e pasta de
    saída `dist/`.
  - O domínio próprio é o que permite o app Android (abaixo): o Google exige
    o arquivo `/.well-known/assetlinks.json` no domínio, ligando-o ao app.
  - Também deixa o produto independente de qualquer serviço de hospedagem.
- **Play Store:** como **TWA** (Trusted Web Activity), gerada com Bubblewrap ou
  PWABuilder. O app abre o site no Chrome do aparelho, em tela cheia.
  - Usa o Chrome de verdade: WebGL, áudio, baixar e compartilhar fotos
    funcionam como no navegador.
  - Atualizar o site atualiza o app, sem nova versão na loja.
  - Falta no projeto: `manifest.webmanifest`, service worker (para abrir sem
    internet) e ícones (192 e 512 px).
  - Alternativa descartada por ora: **Capacitor** (jogo dentro do app, na
    WebView). Funciona offline sem esforço, mas baixar e compartilhar fotos
    da galeria exigiriam plugins nativos, e toda mudança vira versão nova na
    loja.

### Exigências da Play Store (conferir no Play Console — as regras mudam)

- Conta de desenvolvedor: taxa única de US$ 25.
- Contas pessoais novas: teste fechado com cerca de 12 testadores por 14 dias
  antes de publicar para todos.
- Política de privacidade (simples: nada sai do aparelho; as fotos ficam no
  armazenamento local), formulário de Segurança dos dados e classificação
  etária.
- Ícone 512 px, imagem de destaque 1024×500 e capturas de tela (dá para tirar
  com `npm run foto` no tamanho de celular: `W=390 H=844`).

## Modelos de monetização

### 1. Compra única — "Sereno completo" (ponto de partida recomendado)

- **Grátis:** um ambiente completo (Jardim Zen) e a respiração guiada.
- **Pago, uma vez:** libera os demais ambientes, o modo foto e a galeria.
- Combina com o que o Sereno é hoje: um lugar bonito para voltar, não um
  serviço com conteúdo novo toda semana. Com quatro ambientes ainda não há
  volume para justificar assinatura.
- Na Play Store a cobrança passa pelo Google Play Billing (na TWA, via
  Digital Goods API); a loja fica com uma parte de cada venda (na faixa de 15%
  para quem está começando — conferir as taxas atuais).
- Na web, um meio de pagamento próprio (Stripe ou similar), com uma conta
  simples para a compra valer nos dois lugares.

### 2. Pacotes de ambientes (complementa o 1)

- Cada ambiente novo é um pacote vendido à parte (ex.: templo na neve, praia à
  noite, chuva num ryokan).
- A arquitetura já ajuda: um ambiente é uma pasta em `src/environments/`, com
  o contrato no `README.md`.
- Gera receita recorrente sem obrigar ninguém a assinar.

### 3. Assinatura (só mais tarde, se houver cadência)

- É o modelo de Calm e Headspace e o que mais rende, mas o usuário cobra
  conteúdo constante em troca.
- Só vale se houver novidade frequente: um ambiente por mês, sessões guiadas
  com voz, sons para dormir com timer, estações do ano que mudam o cenário.
- Sem essa cadência, vira motivo de avaliação negativa.

### Outras frentes

- **Modo tela (TV, monitor, recepção):** contemplação contínua sem interface,
  para consultórios, clínicas, spas e escritórios. Licença B2B mensal, com
  valor bem maior por cliente.
- **"Apoie o Sereno":** doação opcional na versão web. Rende pouco, mas não
  custa nada e conversa com quem já gosta.
- **Fotos como vitrine:** marca d'água discreta e opcional nas fotos
  compartilhadas do modo foto — divulgação de graça.

## Decisão: a compra vale no app e no site

Mesmo modelo freemium nos dois. Quem comprou no app tem o mesmo conteúdo no
site, e vice-versa. Isso pede **conta e banco de dados**, mas pequenos.

### O que o servidor guarda

Só **quem comprou o quê**. Jardins salvos, areia e fotos continuam no aparelho.

- `usuarios`: id, e-mail.
- `compras`: usuário, produto (`sereno_completo`, depois os pacotes), origem
  (`play` | `web`), id da transação, status (muda com reembolso).

### Login

- **Opcional:** quem fica no grátis nunca vê login. A conta aparece só ao
  comprar ou ao "restaurar compra".
- **Sem senha:** entrar com Google (funciona na TWA, que é o Chrome) e link
  mágico por e-mail como alternativa.

### Compras

- **No app:** Google Play Billing, obrigatório para conteúdo digital em apps
  da loja (há exceções por país — conferir). O servidor confirma a compra na
  API do Google Play e recebe as notificações de reembolso.
- **No site:** Stripe, confirmado por webhook.
- As duas rotas gravam na mesma tabela `compras`, ligada ao usuário.
- **Regra da loja:** o app pode liberar o que foi comprado no site, mas não
  pode direcionar o usuário a pagar fora. No app, o botão é sempre o do
  Google.

### Como encaixa no projeto

- **Vercel Functions** numa pasta `api/` (confirmar compra do Play, webhook
  do Stripe, "minhas compras"), sem build.
- **Banco e login:** Neon (Postgres + Neon Auth), que combina com a Vercel.
  Alternativa equivalente: Supabase.
- **No jogo:** travas nos cartões da tela inicial e no menu "Ambientes". O
  servidor é a fonte da verdade; a lista de compras fica guardada no aparelho
  para abrir offline sem pedir login de novo.
- **Privacidade:** o e-mail passa a sair do aparelho. Atualizar a política de
  privacidade e o formulário de Segurança dos dados da Play Store.

## Ordem sugerida

1. **Produção na Vercel com domínio próprio**, ainda grátis.
2. **Medir antes de cobrar**, com métrica mínima e sem rastreio invasivo:
   quantos voltam no dia seguinte e na semana seguinte, quanto tempo ficam e
   qual ambiente preferem. Se pouca gente volta, nenhum modelo de cobrança
   salva o produto.
3. **PWA + TWA na Play Store** (manifest, service worker, ícones,
   `assetlinks.json` no domínio).
4. **Conta e compras**: banco e login (Neon), funções na Vercel, Stripe no
   site e Play Billing no app.
5. **Testar a compra única**: tela de desbloqueio calma, sem pressão,
   mostrando as capas dos outros ambientes (já existem em `img/ambientes/`).
6. **Lançar um ambiente novo** e ver se as pessoas pagam por ele — responde se
   vale seguir para pacotes ou assinatura.
