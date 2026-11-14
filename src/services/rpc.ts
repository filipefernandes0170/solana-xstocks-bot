// Solana JSON-RPC calls with a time limit and a size limit, tried on each address in turn.
// No config import, so tools (tools/par/check.mts) and tests can use it without the bot's settings.

import axios from "axios";

export const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
export const RPC_TIMEOUT_MS = 10_000;
/** No answer the bot asks for is anywhere near this size; a larger one is refused instead of filling the memory. */
export const RPC_MAX_BYTES = 4_000_000;

/** The configured address first, then the public one (once, if they are the same). */
export function rpcUrls(primary: string) {
  return [...new Set([primary, PUBLIC_RPC].filter(Boolean))];
}

/** One JSON-RPC call. Throws when every address fails; the error says why the last one did. */
export async function rpcCall<T>(urls: string[], method: string, params: unknown[], timeoutMs = RPC_TIMEOUT_MS): Promise<T> {
  let last: unknown = new Error("no RPC address");
  for (const url of urls) {
    try {
      const { data } = await axios.post(
        url,
        { jsonrpc: "2.0", id: 1, method, params },
        { timeout: timeoutMs, maxContentLength: RPC_MAX_BYTES, maxBodyLength: RPC_MAX_BYTES, headers: { "content-type": "application/json" } },
      );
      if (data?.error) throw new Error(`RPC ${method}: ${String(data.error?.message ?? "error").slice(0, 200)}`);
      if (data?.result === undefined) throw new Error(`RPC ${method}: empty answer`);
      return data.result as T;
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
