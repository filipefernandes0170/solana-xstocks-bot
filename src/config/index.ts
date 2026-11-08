import "dotenv/config";
import { z } from "zod";
import { PAR_HOLDER_MIN, PAR_MINT } from "./par.js";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(10),
  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
  JUPITER_API_KEY: z.string().optional(),
  BIRDEYE_API_KEY: z.string().optional(),
  DATABASE_PATH: z.string().default("./data/bot.db"),
  BIG_MOVE_THRESHOLD_PCT: z.coerce.number().default(5),
  BIG_MOVE_WINDOW_MINUTES: z.coerce.number().default(60),
  ALERT_CHECK_INTERVAL_CRON: z.string().default("*/5 * * * *"),
  DESK_CHECK_CRON: z.string().default("* * * * *"),
  // Pause alerts and SEC filing texts (/events).
  EVENTS_CHECK_CRON: z.string().default("*/3 * * * *"),
  // Optional: your own Telegram ID (send /myid to the bot). Health alerts, backup failures and restarts are texted
  // there. Empty means they only go to the log.
  ALERT_CHAT_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().regex(/^-?\d{1,20}$/).optional()),
  TOKEN_MINT: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(32).optional()),
  HOLDER_MIN_TOKENS: z.coerce.number().default(0),
  // Optional: a public Telegram channel (e.g. @parbrief or -100…) where the bot posts a short brief teaser.
  // The bot must be an admin of that channel. Empty means no channel post.
  BRIEF_CHANNEL_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  // Optional: the same secret as SHARE_BUYS_SECRET in Netlify (at least 32 characters). The bot then sends its $1,000
  // buy quotes to the site after each round, so the site shows them at once. Empty means the site quotes alone.
  SHARE_BUYS_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export const config = {
  rpcUrl: env.SOLANA_RPC_URL,
  jupiterApiKey: env.JUPITER_API_KEY,
  birdeyeApiKey: env.BIRDEYE_API_KEY,
  dbPath: env.DATABASE_PATH,
  bigMovePct: env.BIG_MOVE_THRESHOLD_PCT,
  bigMoveWindowMin: env.BIG_MOVE_WINDOW_MINUTES,
  alertCron: env.ALERT_CHECK_INTERVAL_CRON,
  deskCron: env.DESK_CHECK_CRON,
  eventsCron: env.EVENTS_CHECK_CRON,
  alertChatId: env.ALERT_CHAT_ID ?? "",
  // The official address in config/par.ts, unless TOKEN_MINT is set (emergency only).
  tokenMint: env.TOKEN_MINT ?? PAR_MINT,
  // 250,000 $PAR (config/par.ts), unless HOLDER_MIN_TOKENS is set to a positive number.
  holderMin: env.HOLDER_MIN_TOKENS > 0 ? env.HOLDER_MIN_TOKENS : PAR_HOLDER_MIN,
  briefChannelId: env.BRIEF_CHANNEL_ID ?? "",
  shareBuysSecret: (env.SHARE_BUYS_SECRET ?? "").trim(),
};
