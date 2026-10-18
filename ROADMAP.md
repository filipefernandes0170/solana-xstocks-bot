# Roadmap do Par

O que ficou combinado para depois do lançamento, por ordem. Atualizado a 17 out 2026.

## Verificação do fim de semana (a seguir)

- Depois da abertura de segunda: "os tokens marcaram NVDA +2,1% no fim de semana; a Nasdaq abriu +1,8%". A pré-visualização já existe (o desk e o brief de segunda mostram o gap do fim de semana). Falta o placar, que precisa do histórico de preços (começa segunda, 19 out). Fazer a partir de 26 out, quando houver dados reais para o testar.

## Eventos: o que já está e o que falta

- **Feito (fase A, 17 out 2026):** página /events, /events no bot, textos de filings da SEC para holders (máximo 5 por dia), alertas de pausa, feriados e fechos antecipados no brief e no relógio da Nasdaq.
- **Fase B:** datas de resultados com antecedência. Precisa de uma fonte de dados licenciada (custo); hoje o Par só avisa quando os resultados chegam à SEC.
- **Fase C:** um resumo curto de cada filing, escrito por IA, sempre com o link para o original. Precisa de revisão legal (LEX) antes.
- **Notícias:** só com uma fonte licenciada. Copiar notícias de sites não é permitido.

## Próximo update: Par na Robinhood Chain

- A Robinhood Chain abriu na mainnet a 1 de julho de 2026, com stock tokens que negoceiam 24/7 e, segundo as notícias do lançamento, pools da Uniswap e da Pleiades e empréstimos na Morpho.
- A ideia é a mesma pergunta: "o preço é real?". Para cada stock token da Robinhood, mostrar o último preço, uma compra de $1,000 cotada na pool e a diferença para a Nasdaq.
- É preciso: a lista oficial de tokens e pools (fonte da própria Robinhood), um cotador para a Uniswap na Robinhood Chain, e decidir se vive no mesmo site ou numa página própria.
- Liga-se aos outros projetos RH do Filipe.

## Mais nomes

- **Backpack Securities, segunda leva:** MSTR, NFLX, HOOD, BABA e HIMS. Os endereços já estão confirmados pela API oficial da Backpack (`api.backpack.exchange/api/v1/assets`). Ficaram de fora por causa do limite grátis do Jupiter: cada nome a mais torna mais lenta a volta das compras de $1,000.
- **Ondo Global Markets:** quando os tokens da Ondo tiverem pools com liquidez na Solana (a 17 out 2026 nenhum passava dos $20k).
- **Opção:** um plano pago do Jupiter (mais pedidos por segundo) deixava cotar todos os nomes mais depressa. É uma decisão de custo do Filipe.

## Lançamento e crescimento

- **Ranking automático no X:** hoje o ranking sai sozinho num canal do Telegram (se `BRIEF_CHANNEL_ID` estiver preenchido) e há o botão "Save image" no site. Publicar sozinho no X precisa da API do X, que é paga.
- **Financiamento:** uma pequena comissão, sempre avisada, no botão Buy (o concorrente Stocks on Solana usa links de convite da xStocks). Só depois de uma verificação legal (LEX) e com a aprovação do Filipe.

## Vigiar

- **Créditos do Netlify:** com visitantes, a página faz um pedido ao servidor de 10 em 10 segundos (partilhado por todos através da cache). Cada pedido demora uns segundos por causa do ritmo do Jupiter. Depois do lançamento, ver o uso em Netlify → Usage e ajustar se for preciso.
- **Pools pequenas:** AMDx (~$14k) e NFLXx (~$4k) não são cotadas na compra de $1,000 (limite: $25k). Se crescerem, passam a ser cotadas sozinhas.
