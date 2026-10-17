# Recuperação do projeto xstocks-tracker (Par) — 17 out 2026

Estado verificado a **17 out 2026**. Este documento não contém chaves nem segredos, só os **nomes** das variáveis.

## 1. O que é

**Par** diz se uma ação tokenizada na Solana (xStocks: NVDAx, AAPLx, SPYx, TSLAx, QQQx…) está realmente ao preço da ação. Tem duas partes:

| Parte | Onde vive | Estado a 17 out |
|---|---|---|
| **Bot do Telegram** [@ONPAR_BOT](https://t.me/ONPAR_BOT) | Este repositório (`src/`), GitHub `filipefernandes0170/solana-xstocks-bot` (**privado** desde 17 out) | **Recuperado a 100%.** Compila e os testes passam (ver §3). Corre na VM, segundo o Filipe |
| **Site "Par desk"** https://xstocks-tracker.netlify.app | Netlify, projeto `xstocks-tracker`, deploy `6aced2a4bac172109cf9f9c3` de 14 out | **Online, intacto.** O código original perdeu-se. Foi **reconstruído** em `site/` (ver §4). A versão publicada está guardada em `published-site/` |

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

**O site online continua a ser o original do Grok.** Para o substituir pelo reconstruído, falta um passo com a tua autorização: ligar o projeto Netlify a este repositório privado, com a pasta base `site`, e comparar uma pré-visualização antes de publicar.

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
4. **Bot corrigido (17 out):** os ETFs (SPY, QQQ, GLD) passaram a ser pedidos à Nasdaq como "etf" (`src/services/nasdaq.ts`, com teste). A correção está no GitHub. A VM só a recebe numa atualização manual (ver §6.2).
