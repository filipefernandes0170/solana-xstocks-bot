const TERMS = [
  {
    word: "Fair",
    meaning:
      "Nasdaq is open, a $1,000 buy is within 0.4% of the stock, the issuer mark agrees, and the buy does not move the price by 1% or more.",
  },
  { word: "Near", meaning: "The session is open and the buy is not far, but it missed Fair. Read the gap before a larger order." },
  {
    word: "Careful",
    meaning: "The session is open, but a $1,000 buy is at least 1% off the print, or it moves the price by 2% or more.",
  },
  {
    word: "Wait",
    meaning:
      "The session is closed, or the name has no around-the-clock quote. The next open usually pulls the token back toward the print.",
  },
  {
    word: "Overnight",
    meaning: "The session is closed, but Kraken still quotes this name. It can look close. It is still not the Nasdaq print.",
  },
  {
    word: "Split",
    meaning:
      "The pool and the issuer mark disagree, and those two gaps cancel, so the token looks close to the stock. The buy only catches the pool.",
  },
  { word: "Checking", meaning: "A price or the issuer mark is still loading. This is not a buy signal." },
  { word: "No print", meaning: "The Nasdaq print has not come in, so the token is not judged yet." },
  {
    word: "Rich",
    meaning:
      "On the gap pill, the buy is more than 0.02% above the stock. A name can be a little rich and still be Fair, because Fair allows up to 0.4%.",
  },
  {
    word: "Cheap",
    meaning: "On the gap pill, the buy is more than 0.02% below the stock. Cheap is not a promise that the token will rise.",
  },
  { word: "Flat", meaning: "On the gap pill, the buy is within 0.02% of the stock." },
  {
    word: "Gap",
    meaning: "How far a $1,000 buy is from the Nasdaq print. It is not the last trade, and it is not your profit.",
  },
  {
    word: "Share meter",
    meaning:
      "One raw token times the multiplier is the number of shares. The pool prices the raw token. Dividing by the multiplier is the price per share.",
  },
  {
    word: "Multiplier",
    meaning:
      "The number on the mint. It starts at 1. A reinvested dividend or a split raises it. A reverse split lowers it. Your raw tokens do not change.",
  },
  {
    word: "Raw token",
    meaning: "The amount the chain stores. Wallets that know the multiplier show shares instead. A pool trades the raw token.",
  },
];

export function Glossary() {
  return (
    <section className="mt-16" aria-label="Terms">
      <p className="text-sm font-medium tracking-wide text-gold">Terms</p>
      <h2 className="mt-2 font-display text-4xl text-foam">What the words mean</h2>
      <dl className="mt-6 grid gap-6 sm:grid-cols-2">
        {TERMS.map((term) => (
          <div key={term.word}>
            <dt className="font-medium text-foam">{term.word}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-mist">{term.meaning}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
