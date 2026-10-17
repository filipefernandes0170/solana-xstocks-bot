# Recuperação do projeto xstocks-tracker (Par) — 17 out 2026

Estado verificado a **17 out 2026**. Este documento não contém chaves nem segredos, só os **nomes** das variáveis.

## 1. O que é

**Par** diz se uma ação tokenizada na Solana (xStocks: NVDAx, AAPLx, SPYx, TSLAx, QQQx…) está realmente ao preço da ação. Tem duas partes:

| Parte | Onde vive | Estado a 17 out |
|---|---|---|
| **Bot do Telegram** [@ONPAR_BOT](https://t.me/ONPAR_BOT) | Este repositório (`src/`), GitHub `filipefernandes0170/solana-xstocks-bot` (**privado** desde 17 out) | **Recuperado a 100%.** Compila e os testes passam (ver §3). Corre na VM, segundo o Filipe |
| **Site "Par desk"** https://xstocks-tracker.netlify.app | Netlify, projeto `xstocks-tracker`, ligado a este repositório (pasta `site/`) | **Online com a versão reconstruída** desde 17 out, 08:37 UTC (deploy `6ad3321104e3134362f024fe`). O original do Grok (deploy `6aced2a4bac172109cf9f9c3`) fica no Netlify para voltar atrás, e os ficheiros dele estão em `published-site/` |

## 2. Porque se perdeu o código-fonte do site

- O site foi feito pelo **Grok Bot** (a app instalada em `AppData\Local\Programs\Grok Bot`) e publicado pelo conector Netlify do Grok. Provas:
  - a página liga a `/__grok/manifest.webmanifest`;
  - nas definições do Grok Bot está autorizado *"Deploy websites to Netlify using the Netlify connector"*;
  - o Netlify regista o deploy como *"Deploy triggered by upload"*, feito pela API.
- O código foi escrito na nuvem do Grok, não neste PC. O registo do Grok Bot não mostra nenhuma pasta local.
- A 17 out, o próprio Grok confirmou que já não consegue recuperar o código desse deploy.
- O Netlify guardou um zip do código com o deploy (`has_source_zip: true`), mas a API pública do Netlify **não tem forma de o descarregar**. Confirmado na especificação oficial (`netlify/open-api`, `swagger.yml`).
- As funções de servidor (`/_serverFn/…`) não são públicas, e não há source maps (`*.js.map` responde 404).

## 3. O que foi recuperado a 17 out

1. Clonei o repositório para `C:\Users\Filipe\Desktop\$XSTOCKS`, segundo a regra de uma pasta por projeto.
2. Procurei segredos em **todo o histórico** do repositório: nenhum token do Telegram, chave de API ou chave privada. O único `.env` alguma vez enviado é o `.env.example`.
3. Bot:
   - `npm ci` instalou 153 pacotes;
   - `npm run build` (TypeScript) terminou sem erros;
   - `npm test` dá **5 de 5 a passar**;
   - o SQLite (`better-sqlite3`) carrega no Windows.
4. Versão publicada do site (`published-site/`):
   - faltavam 2 ficheiros, que foram acrescentados: `assets/portfolio-B9e0s4hd.js` e `favicon.ico`;
   - os 6 ficheiros estáticos foram comparados byte a byte (sha256) com o site online e são iguais;
   - `.gitattributes` impede que o Git mude as quebras de linha nessa pasta.
5. A pedido do Filipe:
   - o repositório passou a **privado** (tinha 0 forks e 0 estrelas);
   - tudo foi enviado para o `main` no GitHub.

## 4. O site reconstruído (`site/`)

O código novo é editável e fica neste repositório privado. Tem a mesma tecnologia do original (TanStack Start, React 19, Tailwind 4, recharts) e o plugin oficial do Netlify. Os detalhes estão em `site/README.md`. O que foi verificado:

- **Lógica:**
  - 346 455 comparações com as funções originais tiradas do site publicado (veredictos, formatação, horário da Nasdaq, frases): **0 diferenças**;
  - 540 dessas respostas ficaram em `site/tests/golden.json`, e `npm test` volta a confirmá-las sempre que corre.
- **Dados:** comparados campo a campo com o site online:
  - 19 ações, mesma ordem e mesmos campos;
  - preço da Nasdaq, multiplicador e preço do emissor iguais;
  - ofertas e criptos iguais.
- **Aspeto:** em computador e telemóvel, lado a lado com o site online: iguais.
- **Funções testadas:** Markets, Gap (gráfico), Portfolio, Yield, Alerts, "Would this wallet get the text?" e a página `/portfolio`.

Diferenças **de propósito** (todas são correções):
1. SPYx, QQQx e GLDx passam a ter preço da Nasdaq. O original pedia-os como "stocks" e a Nasdaq rejeitava-os.
2. USDC e USDT deixam de valer $0 na página `/portfolio`.
3. O valor no separador Portfolio usa o preço por ação. No ecrã não muda nada.
4. A página `/portfolio` passa a valorizar mais tokens (por exemplo cbBTC).
5. Saiu a "ponte" de pré-visualização do Grok, que não fazia nada para os visitantes.

**Publicado a 17 out 2026, às 08:37 UTC**, a pedido do Filipe, depois de testar o deploy `6ad3321104e3134362f024fe` no endereço próprio dele: todas as páginas, separadores e funções de servidor, sem erros. O Filipe carregou em "Publish Deploy". A publicação automática continua **bloqueada**.

Para voltar à versão do Grok: abrir https://app.netlify.com/projects/xstocks-tracker/deploys/6aced2a4bac172109cf9f9c3 e carregar em **"Publish Deploy"**.

## 5. Como correr

Bot:
```bash
cd '/c/Users/Filipe/Desktop/$XSTOCKS'
npm ci
cp .env.example .env      # depois edita o .env e põe o TELEGRAM_BOT_TOKEN (nunca o partilhes)
npm run dev
```

Site:
```bash
cd '/c/Users/Filipe/Desktop/$XSTOCKS/site'
npm ci
npm run dev:windows       # abre http://localhost:3000
```

Variáveis do bot (só nomes): `TELEGRAM_BOT_TOKEN` (obrigatória), `SOLANA_RPC_URL`, `JUPITER_API_KEY`, `BIRDEYE_API_KEY`, `DATABASE_PATH`, `TOKEN_MINT`, `HOLDER_MIN_TOKENS`, `BIG_MOVE_THRESHOLD_PCT`, `BIG_MOVE_WINDOW_MINUTES`, `ALERT_CHECK_INTERVAL_CRON`, `DESK_CHECK_CRON`.
Variáveis do site (todas opcionais): `SOLANA_RPC_URL`, `JUPITER_API_KEY`, `TOKEN_MINT`, `HOLDER_MIN_TOKENS`.

**Atenção:** só pode haver **uma** cópia do bot a correr com o mesmo token. Se o bot já estiver a correr na VM (`deploy/setup.sh`, serviço `par-bot`), não o corras também aqui, senão o Telegram responde `409 Conflict`.

## 6. Decisões e próximos passos

1. **O bot corre na VM** (Google Cloud), segundo o Filipe. Confirmação rápida: no Telegram, manda `/start` ao [@ONPAR_BOT](https://t.me/ONPAR_BOT). Se responder, está a correr.
2. **Repositório privado.** O bot da VM não é afetado, porque a VM não se atualiza sozinha. Na próxima atualização manual na VM (`git pull`), o GitHub vai pedir acesso. Nessa altura, o agente ajuda a pôr uma *deploy key* só de leitura. Nunca se cola um token no chat.
3. O `netlify.toml` da raiz manda o Netlify construir a pasta `site/`. O Netlify salta a build quando um push não muda nada em `site/`, por isso as alterações do bot nunca mexem no site. A publicação no Netlify fica **bloqueada** ("Lock to stop auto publishing"): cada versão nova do site só vai para o ar depois de testada e publicada à mão ("Publish Deploy").
4. **Bot corrigido e atualizado na VM (17 out, 08:59 UTC):** os ETFs (SPY, QQQ, GLD) passaram a ser pedidos à Nasdaq como "etf" (`src/services/nasdaq.ts`, com teste). Confirmado no Telegram: o cartão do SPYx mostra o preço da Nasdaq ($763.25).
5. **Acesso da VM ao GitHub:** a VM `near-bot` tem uma *deploy key* só de leitura (no GitHub: "par-bot VM near-bot (read-only)"; na VM: `~/.ssh/par_deploy`). A pasta `~/solana-xstocks-bot` usa essa chave. Para atualizar o bot no futuro, na VM:
   ```bash
   cd ~/solana-xstocks-bot && git pull --ff-only && sudo bash deploy/setup.sh
   ```
   Notas:
   - a pasta antiga `~/par-bot-src` já não é usada;
   - o `package-lock.json` que estava solto na pasta ficou guardado em `~/package-lock.solana-xstocks-bot.bak`.
6. **Melhoria possível:** ao parar, o bot não desliga os temporizadores (cron). Por isso, cada reinício espera 90 segundos e o systemd fecha-o à força. É inofensivo, mas pode corrigir-se em `src/index.ts`.
7. **13 melhorias no site e ritmo da Jupiter no bot (17 out 2026).** A lista completa está em `site/README.md` ("Changes after the rebuild"). Em resumo: os pedidos à Jupiter passaram a ir um de cada vez (site e bot), há cache na CDN do Netlify, melhor acessibilidade, cabeçalhos de segurança, rodapé com aviso, imagem para partilhas, página 404, robots/sitemap e registos no servidor. O bot já não espera pelas 19 cotações de compra: são feitas em segundo plano, uma de cada vez.
8. **Chave gratuita da Jupiter (feito a 17 out 2026, só no site):** criada em developers.jup.ag e guardada no Netlify como `JUPITER_API_KEY` (secreta, só para Functions). O plano Free da Jupiter dá **1 pedido a cada 2 segundos** (o portal diz isso na página Billing, e os registos confirmam). É o mesmo ritmo de quem não tem chave, mas no Netlify a chave dá ao site um limite só seu, em vez do endereço partilhado com outros sites. **A chave não vai para o bot na VM:** com a mesma chave, site e bot dividiriam o mesmo limite. Sem chave, o bot usa o limite do endereço da VM. A chave **nunca** vai para o chat nem para o GitHub.
9. **Redesenho, duas funcionalidades novas e correções de cálculo (17 out 2026, segunda volta).**
   - **Correções:** o NFLXx do bot apontava para o token da Chevron (CVXx); agora usa o mint certo, igual ao do site, e há um teste que compara os dois. Os preços passaram a ser por ação em todo o lado: o "gap" estava inflacionado pelo multiplicador (+0,17% no NVDAx, quase ×10 no NFLXx depois do desdobramento) e os valores das carteiras no site estavam a dividir pelo multiplicador duas vezes. O `/yield` do bot tinha taxas inventadas; agora lê a Kamino ao vivo.
   - **Site:** faixa de preços a correr, quatro números ao vivo, cartões com medidor de gap, vista em lista e ordenação, e uma secção nova para quem tem $PAR.
   - **Funcionalidade nova 1, "Size check"** (site e bot `/size NVDAx 5000`): quanto custa de facto uma compra do tamanho que a pessoa escolhe, por ação, contra a Nasdaq.
   - **Funcionalidade nova 2, "Morning brief"** (bot `/brief`, só para quem tem $PAR): nos dias úteis, entre as 9:00 e as 9:29 de Nova Iorque, mostra o que está mais caro e mais barato de comprar, o que está mais perto da Nasdaq, os maiores movimentos e as mudanças de saldo. Não sai nos feriados da bolsa. Opcional: `BRIEF_CHANNEL_ID` publica um resumo curto num canal público, com o bot como administrador.
   - **Bot:** textos novos com emojis por veredito, botões (Buy, verificar o tamanho, Watch), menu de comandos no Telegram, alertas que disparam uma só vez e um `/alert clear`. Agora desliga-se em 3 s, em vez de 90.
10. **Logo novo, página do bot, páginas por ação e histórico (17 out 2026, terceira volta).** Tudo descrito em `site/README.md` ("Brand, the bot page, name pages and history").
   - **Logo:** duas linhas (token e ação) que se encontram num ponto. As imagens (favicon, ícones, pré-visualizações, QR, foto do bot) refazem-se com `tools/brand` (`npm install` e depois `npm run images`).
   - **Foto do bot:** o ficheiro é `tools/brand/out/bot-avatar.png`. Muda-se no Telegram, no @BotFather, com `/setuserpic`. Só o Filipe pode fazer isto.
   - **Páginas novas:** `/bot` (explica o bot, com uma conversa real e QR) e `/s/NVDAx` (uma por ação, com partilha, favoritos e histórico).
   - **Histórico do gap:** uma função agendada do Netlify grava os preços de 15 em 15 minutos, nos dias úteis, das 12:00 às 21:45 UTC, em "Blobs" do Netlify. Gasta cerca de 10 dos 300 créditos mensais do plano grátis. O histórico só começa a aparecer depois da primeira sessão da bolsa a seguir à publicação.
   - **Bot:** o link "Watch in Telegram" dos favoritos (`?start=w-...`) liga o `/watch` para essas ações. É preciso atualizar a VM para isto funcionar.
11. **Portfolio novo (17 out 2026, quarta volta).** Tudo descrito em `site/README.md` ("Portfolio upgrade").
   - **O bag ao preço real:** cada xStock da carteira ao último preço na Solana, ao lado das mesmas ações ao preço da Nasdaq, com a diferença e o veredito.
   - **Preço de saída:** um botão pede ao Jupiter quanto daria vender cada posição agora (as 10 maiores, uma de cada vez). É só uma cotação: nada é assinado nem enviado.
   - **Visual novo:** total grande, mapa colorido das posições e cartões no telemóvel.
   - **Vigiar no Telegram:** o botão "Watch this bag" abre o bot com o endereço público (`?start=p-...`). O bot guarda a carteira e avisa (só quem tem $PAR) quando algo muda. É preciso atualizar a VM para isto funcionar.
   - **Rendimento possível:** as taxas reais do Kamino para as ações que a carteira tem, em dólares por ano. Não é conselho.
   - **Próximos eventos:** os "rebases" que vão mudar o número de tokens na carteira.
   - **Créditos do Netlify:** a página só atualiza os preços depois de ler uma carteira, e o preço de saída só gasta quando alguém carrega no botão.
