// Scheduled: once a day at 00:20 UTC. Reads every tracked mint on Solana and keeps its raw supply and decimals in one
// Netlify Blob per UTC day, for "Supply on Solana" (tokens created or destroyed). One RPC request a day.
// The site also writes today's reading when a visitor comes first, so a missed run only leaves a smaller gap.

import { getStore } from "@netlify/blobs";
import { parseMintState, type MintAccount } from "../../src/lib/events";
import { SUPPLY_STORE, supplyKey, type SupplyReading } from "../../src/lib/supply";
import { TOKENS } from "../../src/lib/tokens";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

async function readMints(url: string): Promise<MintAccount[] | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getMultipleAccounts",
        params: [TOKENS.map((token) => token.mint), { encoding: "jsonParsed", commitment: "confirmed" }],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { result?: { value?: MintAccount[] } };
    const value = body.result?.value;
    return Array.isArray(value) && value.length === TOKENS.length ? value : null;
  } catch {
    return null;
  }
}

export default async () => {
  const configured = (process.env.SOLANA_RPC_URL ?? "").trim();
  // Never log the URL: a private RPC URL can contain an API key.
  const accounts = (configured ? await readMints(configured) : null) ?? (await readMints(DEFAULT_RPC));
  if (!accounts) {
    console.warn("[par] record-supply: the mints could not be read");
    return;
  }
  const now = Date.now();
  const rows: SupplyReading["rows"] = {};
  TOKENS.forEach((token, index) => {
    const state = parseMintState(token.symbol, accounts[index]);
    if (state.supplyRaw != null && state.decimals != null) rows[token.symbol] = { raw: state.supplyRaw, decimals: state.decimals };
  });
  if (Object.keys(rows).length === 0) {
    console.warn("[par] record-supply: nothing to record");
    return;
  }
  await getStore(SUPPLY_STORE).setJSON(supplyKey(now), { t: now, rows } satisfies SupplyReading);
  console.log(`[par] record-supply: ${Object.keys(rows).length} names`);
};

export const config = {
  schedule: "20 0 * * *",
};
