// The bot's handlers, driven by made-up Telegram updates. Nothing here talks to Telegram: there is no polling, the
// token is not real, and every API call the bot would make is caught and kept in a list.
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-token-not-real";
// The database module opens DATABASE_PATH when it loads: a throwaway file, never the bot's own.
process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "par-botflow-")), "bot.db");

const { PublicKey } = await import("@solana/web3.js");
const { Telegram } = await import("telegraf");
const { createBot } = await import("../bot/index.js");
const db = await import("../db/index.js");
const proof = await import("./walletProof.js");
const { PAR_MINT } = await import("../config/par.js");

type Call = { method: string; payload: Record<string, unknown> };
const calls: Call[] = [];
const bot = createBot();
bot.botInfo = { id: 1, is_bot: true, first_name: "Par", username: "ONPAR_BOT", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false } as never;
// Telegraf makes a new client for each update, so the catch sits on the class: no request ever leaves this process.
let slowChat: number | null = null;
(Telegram.prototype as unknown as { callApi: (method: string, payload: Record<string, unknown>) => Promise<unknown> }).callApi = async (method, payload) => {
  if (slowChat != null && payload.chat_id === slowChat) await new Promise((resolve) => setTimeout(resolve, 800));
  calls.push({ method, payload });
  return method === "sendMessage" ? { message_id: calls.length, chat: { id: payload.chat_id }, date: 0, text: payload.text } : true;
};

// What the site would answer for each code at /api/proof; any other request fails, so no test reaches the network.
const siteProofs = new Map<string, { address: string; signature: string }>();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
  const url = String(input);
  const match = /^https:\/\/onpar\.site\/api\/proof\?n=([0-9a-f]{32})$/.exec(url);
  if (!match) throw new Error(`unexpected request in a test: ${url}`);
  const found = siteProofs.get(match[1]);
  return new Response(JSON.stringify(found ?? null), { status: found ? 200 : 404, headers: { "content-type": "application/json" } });
}) as typeof fetch;
after(() => {
  globalThis.fetch = realFetch;
});

let updateId = 0;
const person = (id: number) => ({ id, is_bot: false, first_name: `User${id}`, username: `user${id}` });
const message = (from: number, text: string) => ({
  update_id: ++updateId,
  message: {
    message_id: updateId,
    date: 0,
    chat: { id: from, type: "private" as const, first_name: `User${from}` },
    from: person(from),
    text,
    ...(text.startsWith("/") ? { entities: [{ type: "bot_command" as const, offset: 0, length: text.split(/\s/)[0].length }] } : {}),
  },
});
const button = (from: number, data: string) => ({
  update_id: ++updateId,
  callback_query: { id: String(updateId), from: person(from), chat_instance: "x", data, message: { message_id: 1, date: 0, chat: { id: from, type: "private" as const, first_name: `User${from}` } } },
});

/** Hands the bot one update and waits until its (now detached) handler has finished sending. */
async function deliver(update: object, settleMs = 60) {
  const before = calls.length;
  await bot.handleUpdate(update as never);
  for (let waited = 0; waited < 3000; waited += 20) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (calls.length > before && waited >= settleMs) break;
  }
  return calls.slice(before);
}
const texts = (list: Call[]) => list.filter((call) => call.method === "sendMessage").map((call) => String(call.payload.text));
const proofCode = (list: Call[]) => {
  for (const call of list) {
    const rows = (call.payload.reply_markup as { inline_keyboard?: { callback_data?: string }[][] } | undefined)?.inline_keyboard ?? [];
    for (const row of rows) for (const key of row) if (key.callback_data?.startsWith("proof:check:")) return key.callback_data.slice("proof:check:".length);
  }
  return null;
};

function wallet() {
  const pair = generateKeyPairSync("ed25519");
  const address = new PublicKey(pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32)).toBase58();
  return { address, sign: (text: string) => sign(null, Buffer.from(text, "utf8"), pair.privateKey).toString("base64") };
}

test("a slow request no longer holds up the next person", async () => {
  // One person's reply takes 0.8 s to send (a slow lookup would do the same). Telegraf used to wait for it before
  // taking the next message; now handing the update over returns at once, and the next person is answered meanwhile.
  slowChat = 5;
  const started = Date.now();
  await bot.handleUpdate(message(5, "zzzz not a name") as never);
  assert.ok(Date.now() - started < 400, `handing over the update returned at once (${Date.now() - started} ms)`);
  const [quick] = texts(await deliver(message(6, "/ca")));
  assert.match(quick, /\$PAR is not live yet/, "the next person is answered while the first reply is still on its way");
  assert.ok(Date.now() - started < 700, "and before the slow one finished");
  assert.equal(calls.filter((call) => call.payload.chat_id === 5).length, 0);
  await new Promise((resolve) => setTimeout(resolve, 900));
  assert.equal(calls.filter((call) => call.payload.chat_id === 5).length, 1, "the slow reply still arrives");
  slowChat = null;
});

test("/ca before launch says $PAR is not live, and names no address", async () => {
  assert.equal(PAR_MINT, "", "this test is about the days before launch");
  const [reply] = texts(await deliver(message(100, "/ca")));
  assert.match(reply, /\$PAR is not live yet/);
  assert.doesNotMatch(reply, /<code>/);
});

test("/hold, the site's ?start=hold link and /start all hand out the same young code, in the button", async () => {
  const first = await deliver(message(200, "/hold"));
  assert.match(texts(first)[0], /Prove the wallet that holds \$PAR/);
  const code = proofCode(first);
  assert.ok(code && proof.isNonce(code));
  const viaSite = await deliver(message(200, "/start hold"));
  assert.match(texts(viaSite)[0], /Prove the wallet that holds \$PAR/, "?start=hold answers like /hold");
  assert.equal(texts(viaSite).length, 1, "and nothing else");
  assert.equal(proofCode(viaSite), code);
  const welcome = await deliver(message(200, "/start"));
  const welcomeUrl = (welcome[0].payload.reply_markup as { inline_keyboard: { url?: string }[][] }).inline_keyboard[0][0].url;
  assert.equal(welcomeUrl, `https://onpar.site/verify?n=${code}`, "the welcome carries the same code");
  const url = ((first[0].payload.reply_markup as { inline_keyboard: { url?: string }[][] }).inline_keyboard[0][0].url ?? "") as string;
  assert.equal(url, `https://onpar.site/verify?n=${code}`);
});

test("a signed code proves the wallet, once, and the button under an older message still works", async () => {
  const owner = wallet();
  const code = proofCode(await deliver(message(300, "/hold"))) as string;
  // Nothing signed yet.
  assert.match(texts(await deliver(button(300, `proof:check:${code}`)))[0], /No signature for this code yet/);
  assert.equal(db.getUser(300)?.verified_wallet ?? null, null);

  siteProofs.set(code, { address: owner.address, signature: owner.sign(proof.proofMessage(code)) });
  const done = texts(await deliver(button(300, `proof:check:${code}`)));
  assert.match(done[0], /Wallet proven/);
  assert.equal(db.getUser(300)?.verified_wallet, owner.address);
  // The code is spent: asking again offers a new one, and it is not the same.
  const again = await deliver(button(300, `proof:check:${code}`));
  assert.match(texts(again)[0], /already used/);
  assert.notEqual(proofCode(again), code);
});

test("someone else's code, a forged signature and a signature for another code prove nothing", async () => {
  const owner = wallet();
  const code = proofCode(await deliver(message(400, "/hold"))) as string;
  siteProofs.set(code, { address: owner.address, signature: owner.sign(proof.proofMessage(code)) });
  // Another person presses a button with this code: it is not theirs.
  assert.match(texts(await deliver(button(401, `proof:check:${code}`)))[0], /not yours/);
  assert.equal(db.getUser(401)?.verified_wallet ?? null, null);
  assert.match(texts(await deliver(message(401, `/start v-${code}`)))[0], /not yours/);

  // The address nobody owns, with the signature anyone can write down.
  const nobody = new PublicKey(Buffer.concat([Buffer.from([1]), Buffer.alloc(31)])).toBase58();
  const forged = Buffer.concat([Buffer.from([1]), Buffer.alloc(63)]).toString("base64");
  const mine = proofCode(await deliver(message(402, "/hold"))) as string;
  siteProofs.set(mine, { address: nobody, signature: forged });
  assert.match(texts(await deliver(button(402, `proof:check:${mine}`)))[0], /did not check out/);
  assert.equal(db.getUser(402)?.verified_wallet ?? null, null);

  // A real signature, but for a different code.
  const other = proofCode(await deliver(message(403, "/hold"))) as string;
  siteProofs.set(other, { address: owner.address, signature: owner.sign(proof.proofMessage(code)) });
  assert.match(texts(await deliver(button(403, `proof:check:${other}`)))[0], /did not check out/);
  assert.equal(db.getUser(403)?.verified_wallet ?? null, null);
});

test("a wallet proven on a second account leaves the first, which is told", async () => {
  const owner = wallet();
  for (const id of [500, 501]) {
    const code = proofCode(await deliver(message(id, "/hold"))) as string;
    siteProofs.set(code, { address: owner.address, signature: owner.sign(proof.proofMessage(code)) });
    const sent = await deliver(message(id, `/start v-${code}`), 150);
    assert.match(texts(sent)[0], /Wallet proven/);
    if (id === 501) {
      const toFirst = sent.find((call) => call.method === "sendMessage" && call.payload.chat_id === 500);
      assert.match(String(toFirst?.payload.text), /proven by another Telegram account/);
    }
  }
  assert.equal(db.getUser(500)?.verified_wallet ?? null, null);
  assert.equal(db.getUser(501)?.verified_wallet, owner.address);
});

test("an old plain button finds the signed code among the recent ones; an expired code gets a fresh button", async () => {
  const owner = wallet();
  db.upsertUser(600, "user600", "User600");
  const now = Date.now();
  // Two codes from the last minutes (as buttons sent before the code rode in them would leave), the older one signed.
  db.createProof(600, "a".repeat(32), now - 9 * 60_000);
  db.createProof(600, "b".repeat(32), now - 6 * 60_000);
  siteProofs.set("a".repeat(32), { address: owner.address, signature: owner.sign(proof.proofMessage("a".repeat(32))) });
  assert.match(texts(await deliver(button(600, "proof:check")))[0], /Wallet proven/);
  assert.equal(db.getUser(600)?.verified_wallet, owner.address);

  db.upsertUser(601, "user601", "User601");
  db.createProof(601, "c".repeat(32), now - 20 * 60_000);
  const expired = await deliver(button(601, `proof:check:${"c".repeat(32)}`));
  assert.match(texts(expired)[0], /expired/);
  const fresh = proofCode(expired);
  assert.ok(fresh && fresh !== "c".repeat(32), "the reply carries a new code to sign");
  const none = await deliver(message(602, "/hold check"));
  assert.match(texts(none)[0], /no code waiting/);
});

test("an error in an update with no chat to answer in does not escape (it used to end the process)", async () => {
  const escaped: unknown[] = [];
  const onEscape = (reason: unknown) => escaped.push(reason);
  process.on("unhandledRejection", onEscape);
  // A button press that carries no message: the handler's reply throws, and so would the error handler's own reply.
  await bot.handleUpdate({ update_id: ++updateId, callback_query: { id: "x", from: person(700), chat_instance: "x", data: "menu:size" } } as never);
  await new Promise((resolve) => setTimeout(resolve, 200));
  process.off("unhandledRejection", onEscape);
  assert.deepEqual(escaped, []);
});

test("in a burst, new messages wait their turn once 25 are in hand", async () => {
  // Thirty people whose replies each take 0.8 s to send.
  slowChat = 800;
  const started = Date.now();
  const handed: number[] = [];
  const all = Array.from({ length: 30 }, (_, i) =>
    bot.handleUpdate({ ...message(800, "/ca"), update_id: ++updateId } as never).then(() => handed.push(Date.now() - started)),
  );
  await Promise.all(all);
  const quick = handed.filter((ms) => ms < 400).length;
  assert.ok(quick >= 20 && quick <= 26, `about the first 25 are taken at once (${quick})`);
  assert.ok(handed.some((ms) => ms >= 700), "the rest wait until one of those is done");
  await new Promise((resolve) => setTimeout(resolve, 900));
  slowChat = null;
});
