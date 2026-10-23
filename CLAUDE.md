# Sereno — instruções do projeto

Jogo/app de meditação em three.js, sem build. Português em código,
comentários e interface.

## Ordem de trabalho

- `npm start` e abrir `http://localhost:5173` para ver na tela.
- `npm run foto` (ou `-- --todos`, `-- --js "..."`) para conferir o visual sem
  abrir o navegador; as fotos saem em `fotos/` e os erros do console aparecem
  no terminal. Depois de mexer em modelo, luz ou material, olhe a foto antes
  de dar por pronto — a qualidade visual é o produto.
- No console do navegador, `window.sereno` expõe motor, ambiente, objetos etc.
- `npm run bench` mede o tempo de quadro com a GPU real, ligando e desligando
  recursos. Rode antes e depois de qualquer mudança que possa pesar.

## Desempenho (medido, não chutado)

- O custo é quase todo **por pixel**, não por triângulo: folhagem e grama
  pesam pouco; resolução, pós-processamento e luzes pontuais pesam muito.
- Nada de MSAA no alvo do composer (era o maior custo); a suavização é o SMAA.
- A densidade de pixels é da `ResolutionGovernor` (`core/resolution.js`); não
  fixe `setPixelRatio` em outro lugar.
- Nada caro de GPU durante o jogo: mapas de ambiente são gerados no
  carregamento (`prepareEnvironments`), shaders do catálogo são pré-compilados
  em `main.js`, e a areia envia à GPU só o retângulo rastelado.

## Princípios

- Tudo procedural e com semente: nada de arquivos de textura, modelo ou áudio.
- Calma acima de tudo: transições lentas, sons suaves, nada que pisque ou
  apresse. A interface some quando ninguém mexe.
- `core/` não conhece nenhum ambiente; o que é específico do Jardim Zen fica
  em `environments/jardim-zen/`. A arquitetura e o contrato de um ambiente
  estão no `README.md`.
- Luzes pontuais só pelo `LightPool` (declarar `userData.lights`), nunca
  `new PointLight` por objeto: mudar o número de luzes recompila todos os
  shaders.
