import "dotenv/config";
import { z } from "zod";

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
  TOKEN_MINT: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(32).optional()),
  HOLDER_MIN_TOKENS: z.coerce.number().default(0),
  // Optional: a public Telegram channel (e.g. @parbrief or -100…) where the bot posts a short brief teaser.
  // The bot must be an admin of that channel. Empty means no channel post.
  BRIEF_CHANNEL_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
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
  tokenMint: env.TOKEN_MINT ?? "",
  holderMin: env.HOLDER_MIN_TOKENS,
  briefChannelId: env.BRIEF_CHANNEL_ID ?? "",
};
