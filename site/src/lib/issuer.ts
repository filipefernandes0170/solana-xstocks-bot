// What a token's issuer can still do, read from the mint account on Solana (Token-2022 extensions).
// Pure, so the page and the tests share it. These are powers the mint carries, not events: Par does not say they
// will be used, only that the chain allows them.

export type MintExtension = { extension?: string; state?: Record<string, unknown> };

/** The parts of a jsonParsed mint account this reads. */
export type ParsedMint = {
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  supply?: string;
  decimals?: number;
  extensions?: MintExtension[];
};

export type PowerId = "seize" | "freeze" | "pause" | "hook" | "multiplier" | "mint" | "frozenStart";

export type Power = {
  id: PowerId;
  /** True when the mint gives someone this power today. */
  on: boolean;
  title: string;
  line: string;
  /** The address that holds the power, when there is one. */
  authority: string | null;
  /** Something happening now, such as transfers being paused. */
  now: string | null;
};

function text(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function extension(mint: ParsedMint, name: string) {
  return mint.extensions?.find((entry) => entry.extension === name)?.state ?? null;
}

/** The powers that matter to a holder, most serious first. */
export function issuerPowers(mint: ParsedMint): Power[] {
  const delegate = text(extension(mint, "permanentDelegate")?.delegate);
  const pausable = extension(mint, "pausableConfig");
  const pauseAuthority = text(pausable?.authority);
  const hook = extension(mint, "transferHook");
  const hookProgram = text(hook?.programId);
  const hookAuthority = text(hook?.authority);
  const scaled = extension(mint, "scaledUiAmountConfig");
  const scaledAuthority = text(scaled?.authority);
  const defaultState = text(extension(mint, "defaultAccountState")?.accountState);
  const freezeAuthority = text(mint.freezeAuthority);
  const mintAuthority = text(mint.mintAuthority);

  const powers: Power[] = [
    {
      id: "seize",
      on: delegate != null,
      title: delegate ? "Can move or burn tokens from any wallet" : "Cannot move tokens out of your wallet",
      line: delegate
        ? "The mint has a permanent delegate: one address that can transfer or burn tokens from any holder's account without the holder signing."
        : "There is no permanent delegate, so only you can move tokens out of your account.",
      authority: delegate,
      now: null,
    },
    {
      id: "freeze",
      on: freezeAuthority != null,
      title: freezeAuthority ? "Can freeze your tokens" : "Cannot freeze tokens",
      line: freezeAuthority
        ? "The freeze authority can lock any holder's account, so its tokens cannot be sent or sold until it is thawed."
        : "There is no freeze authority, so no one can lock your account.",
      authority: freezeAuthority,
      now: null,
    },
    {
      id: "pause",
      on: pauseAuthority != null,
      title: pauseAuthority ? "Can pause every transfer" : "Cannot pause transfers",
      line: pauseAuthority
        ? "The pause authority can stop every transfer of this token at once, for every holder."
        : "There is no pause switch on this token.",
      authority: pauseAuthority,
      now: pausable?.paused === true ? "Transfers are paused right now." : null,
    },
    {
      id: "hook",
      on: hookProgram != null || hookAuthority != null,
      title: hookProgram ? "Runs a program on every transfer" : hookAuthority ? "Can add a transfer rule later" : "No transfer rules",
      line: hookProgram
        ? "A transfer hook program runs on every transfer and can refuse one."
        : hookAuthority
          ? "No transfer hook runs today, but its authority can switch one on, and a hook can refuse transfers."
          : "No program can be added to check transfers.",
      authority: hookProgram ?? hookAuthority,
      now: null,
    },
    {
      id: "multiplier",
      on: scaledAuthority != null,
      title: scaledAuthority ? "Can change the multiplier" : "Fixed balance display",
      line: scaledAuthority
        ? "The multiplier authority sets how many tokens every balance shows. It is how splits and dividends reach holders."
        : "No one can rescale how balances are shown.",
      authority: scaledAuthority,
      now: null,
    },
    {
      id: "mint",
      on: mintAuthority != null,
      title: mintAuthority ? "Can create new tokens" : "Supply is fixed",
      line: mintAuthority ? "The mint authority can create new tokens." : "No one can create more of this token.",
      authority: mintAuthority,
      now: null,
    },
  ];
  if (defaultState === "frozen") {
    powers.push({
      id: "frozenStart",
      on: true,
      title: "New accounts start frozen",
      line: "A new holder's account is frozen until the issuer thaws it.",
      authority: freezeAuthority,
      now: null,
    });
  }
  return powers;
}

/** "5aMN…FvEq" */
export function shortKey(address: string) {
  return address.length < 12 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export type IssuerResult =
  | { ok: true; symbol: string; mint: string; program: "Token-2022" | "Token"; powers: Power[]; at: number }
  | { ok: false; symbol: string; message: string };
