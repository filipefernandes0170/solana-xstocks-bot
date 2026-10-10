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
};
