/** Footer on every page: what Par is not, and where each number comes from. */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-white/10 pt-6 text-sm leading-relaxed text-mist">
      <p className="max-w-3xl">
        Par is not financial advice. Prices can be late or wrong, so check before you trade. Par takes no fee, never holds your funds, and
        never asks you to sign a transaction.
      </p>
      <p className="mt-3 max-w-3xl">
        Sources: token prices and the $1,000 buy from Jupiter (GeckoTerminal as a backup), stock prints from Nasdaq, lending rates from
        Kamino, coin prices from CoinGecko.
      </p>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        <a href="https://t.me/ONPAR_BOT" className="text-foam underline decoration-gold/70 underline-offset-4">
          @ONPAR_BOT on Telegram
        </a>
        <a href="/ranking" className="text-foam underline decoration-gold/70 underline-offset-4">
          This week's ranking
        </a>
      </p>
    </footer>
  );
}
