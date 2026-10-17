# Recuperação do projeto xstocks-tracker (Par) — 17 out 2026

Estado verificado a **17 out 2026**. Este documento não contém chaves nem segredos, só os **nomes** das variáveis.

## 1. O que é

**Par** diz se uma ação tokenizada na Solana (xStocks: NVDAx, AAPLx, SPYx, TSLAx, QQQx…) está realmente ao preço da ação. Tem duas partes:

| Parte | Onde vive | Estado a 17 out |
|---|---|---|
| **Bot do Telegram** [@ONPAR_BOT](https://t.me/ONPAR_BOT) | Este repositório (`src/`), GitHub `filipefernandes0170/solana-xstocks-bot` (**público**) | **Recuperado a 100%.** Compila e os testes passam (ver §3) |
| **Site "Par desk"** https://xstocks-tracker.netlify.app | Netlify, projeto `xstocks-tracker`, deploy `6aced2a4bac172109cf9f9c3` de 14 out | **Online.** Só existe a versão construída (`published-site/`). **O código-fonte não está aqui** (ver §2) |

## 2. Porque falta o código-fonte do site

- O site foi feito pelo **Grok Bot** (a app instalada em `AppData\Local\Programs\Grok Bot`) e publicado pelo conector Netlify do Grok. Provas:
  - a página liga a `/__grok/manifest.webmanifest`;
  - nas definições do Grok Bot está autorizado *"Deploy websites to Netlify using the Netlify connector"*;
  - o Netlify regista o deploy como *"Deploy triggered by upload"*, feito pela API.
- O código foi escrito na nuvem do Grok, não neste PC. O registo do Grok Bot não mostra nenhuma pasta local.
- O Netlify guardou um zip do código com o deploy (`has_source_zip: true`), mas a API pública do Netlify **não tem forma de o descarregar**. Confirmado na especificação oficial (`netlify/open-api`, `swagger.yml`).
- O site usa funções no servidor para ir buscar os preços (`/_serverFn/…`). Esse código também não é público.
- Não há source maps publicados (`*.js.map` responde 404).

**Conclusão:** a única cópia fiel do código do site está na tua conta do Grok Bot.

## 3. O que foi feito a 17 out

1. Clonei o repositório para `C:\Users\Filipe\Desktop\$XSTOCKS`, segundo a regra de uma pasta por projeto.
2. Procurei segredos em **todo o histórico** do repositório público: nenhum token do Telegram, chave de API ou chave privada. O único `.env` alguma vez enviado é o `.env.example`.
3. Bot:
   - `npm ci` instalou 153 pacotes;
   - `npm run build` (TypeScript) terminou sem erros;
   - `npm test` dá **5 de 5 a passar**;
   - o SQLite (`better-sqlite3`) carrega no Windows.
4. Cópia do site (`published-site/`):
   - faltavam 2 ficheiros que o site serve: o código da página `/portfolio` (`assets/portfolio-B9e0s4hd.js`) e o `favicon.ico`. Foram acrescentados;
   - os 6 ficheiros estáticos foram comparados byte a byte (sha256) com o site online e são iguais. A lista está em `published-site/README.md`;
   - um novo `.gitattributes` impede que o Git mude as quebras de linha nessa pasta. No Windows, isso fazia os ficheiros parecerem diferentes.
5. Tudo está num ramo local, `recovery/2026-10-17`. **Nada foi enviado para o GitHub.**

## 4. Como recuperar o código do site (tu, no Grok Bot)

1. Abre o **Grok Bot** e procura a conversa ou o projeto onde foi feito o site Par. O deploy foi a 14 out, por volta das 01:55 de Lisboa.
2. Escreve-lhe esta mensagem (copia e cola):

   > Please give me the complete source code of the Par desk site you deployed to the Netlify project xstocks-tracker (deploy 6aced2a4bac172109cf9f9c3): every file — package.json, the lockfile, vite/TanStack config, src/ (routes, components, server functions) and public/ — but NOT node_modules, NOT .env files and NOT any keys. Put it in a single zip I can download. Also list the names (not the values) of every environment variable the site needs.

3. Descarrega o zip para a pasta **Downloads** e diz-me o nome do ficheiro. **Não** o abras nem o corras antes de eu o verificar.
4. Se o Grok já não tiver a conversa ou o projeto, diz-me. Há um plano B (§5).

Quando o zip chegar, eu:
- verifico que não tem segredos;
- compilo o site e comparo o resultado com o que está online;
- ponho-o num sítio seguro, à tua escolha: este repositório é **público**, por isso pode ser melhor um repositório privado.

## 5. Plano B (só se o Grok não tiver o código)

Reconstruir o site:
- o aspeto e o comportamento vêm do código publicado (`published-site/`);
- a lógica de preços e veredictos vem do próprio bot (`src/services/desk.ts`, `verdict.ts`, `prices.ts`), que usa as mesmas regras.

Fica um site novo, equivalente, com código que é teu e que pode ser editado. **Não** é uma cópia exata. Antes de o publicar, comparo-o lado a lado com o atual. Não comeces por aqui: o §4 é mais rápido e fiel.

## 6. Como correr o bot

```bash
cd '/c/Users/Filipe/Desktop/$XSTOCKS'
npm ci
cp .env.example .env      # depois edita o .env e põe o TELEGRAM_BOT_TOKEN (nunca o partilhes)
npm run dev
```

Variáveis (só nomes): `TELEGRAM_BOT_TOKEN` (obrigatória), `SOLANA_RPC_URL`, `JUPITER_API_KEY`, `BIRDEYE_API_KEY`, `DATABASE_PATH`, `TOKEN_MINT`, `HOLDER_MIN_TOKENS`, `BIG_MOVE_THRESHOLD_PCT`, `BIG_MOVE_WINDOW_MINUTES`, `ALERT_CHECK_INTERVAL_CRON`, `DESK_CHECK_CRON`.

**Atenção:** só pode haver **uma** cópia do bot a correr com o mesmo token. Se o bot já estiver a correr na VM (`deploy/setup.sh`, serviço `par-bot`), não o corras também aqui, senão o Telegram responde `409 Conflict`.

## 7. Por confirmar contigo

1. O bot ainda está a correr na VM (Google Cloud), ou parou?
2. Onde queres guardar o código do site quando o recuperares: neste repositório público ou num privado novo?
3. Envio o ramo `recovery/2026-10-17` para o GitHub? É público e o Netlify ignora as builds deste repositório (`netlify.toml`: `ignore = "exit 0"`), por isso **não** mexe no site online.
