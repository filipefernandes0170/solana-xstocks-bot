// Checks the $PAR address before it is published. Run from the repo root:
//
//   npm run check:par                       the address in the code (bot and site must agree), read on chain
//   npm run check:par -- <mint>             any other address, to try the check out before launch day
//   npm run check:par -- <mint> <wallet>    also: would this wallet count as a holder (250,000 or more)?
//
// It only reads. It never signs or sends anything, and needs no settings or keys.

import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PAR_HOLDER_MIN, PAR_MINT as BOT_MINT } from "../../src/config/par.ts";
import { PAR_MINT as SITE_MINT } from "../../site/src/lib/holder.ts";
import { accountHolds, holderThreshold, mintReport, mintWarnings, readMint, supplyTokens, type TokenAccountSlice } from "../../src/services/parMint.ts";
import { PUBLIC_RPC, rpcCall } from "../../src/services/rpc.ts";

const [argMint, argWallet] = process.argv.slice(2);
const urls = [process.env.SOLANA_RPC_URL || PUBLIC_RPC];
let failed = false;
const fail = (line: string) => {
  failed = true;
  console.log(`FAIL  ${line}`);
};
const ok = (line: string) => console.log(`ok    ${line}`);

let mint = argMint ?? "";
if (!argMint) {
  if (BOT_MINT !== SITE_MINT) fail(`the bot (src/config/par.ts) and the site (site/src/lib/holder.ts) have different addresses:\n      bot  "${BOT_MINT}"\n      site "${SITE_MINT}"`);
  else ok("the bot and the site have the same address");
  mint = BOT_MINT;
  if (!mint) {
    console.log("      $PAR has no address in the code yet. To try the check, pass any token address: npm run check:par -- <mint>");
    process.exit(failed ? 1 : 0);
  }
}

let key: PublicKey | null = null;
try {
  key = new PublicKey(mint);
  if (key.toBase58() !== mint) throw new Error("not canonical");
  ok(`${mint} is a valid Solana address`);
} catch {
  fail(`"${mint}" is not a valid Solana address`);
}

if (key) {
  try {
    const reading = await readMint(urls, mint);
    console.log(mintReport(mint, reading).split("\n").map((line) => `      ${line}`).join("\n"));
    if (reading.status === "bad") fail(`not a token: ${reading.reason}`);
    else {
      ok(`it is a token: ${reading.decimals} decimals, supply ${supplyTokens(reading).toLocaleString("en-US")}`);
      for (const warning of mintWarnings(reading)) console.log(`WARN  ${warning}`);
      if (argWallet) {
        const owner = new PublicKey(argWallet);
        const account = getAssociatedTokenAddressSync(key, owner, true, new PublicKey(reading.programId)).toBase58();
        const result = await rpcCall<{ value?: TokenAccountSlice[] }>(urls, "getMultipleAccounts", [
          [account],
          { encoding: "base64", commitment: "confirmed", dataSlice: { offset: 0, length: 72 } },
        ]);
        const slice = result?.value?.[0] ?? null;
        const raw = slice?.data?.[0] ? Buffer.from(slice.data[0], "base64").readBigUInt64LE(64) : 0n;
        const holds = accountHolds(slice, key.toBytes(), owner.toBytes(), holderThreshold(PAR_HOLDER_MIN, reading.decimals));
        console.log(`      wallet ${argWallet}\n      its account ${account} holds ${(Number(raw) / 10 ** reading.decimals).toLocaleString("en-US")}`);
        console.log(`      holder (at least ${PAR_HOLDER_MIN.toLocaleString("en-US")}): ${holds ? "YES" : "no"}`);
      }
    }
  } catch (err) {
    fail(`the chain could not be read: ${(err as Error).message}`);
  }
}

console.log(failed ? "\nNOT OK. Do not publish this address." : "\nAll good.");
process.exit(failed ? 1 : 0);
