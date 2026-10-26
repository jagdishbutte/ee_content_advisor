import { z } from "zod";

// Each group is parsed on first use so a missing optional integration (e.g. Telegram)
// never breaks unrelated code paths.

const int = (fallback: number) => z.coerce.number().int().nonnegative().default(fallback);

const supabaseSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const llmSchema = z.object({
  LLM_API_KEY: z.string().min(1),
  LLM_BASE_URL: z.url().default("https://api.groq.com/openai/v1"),
  LLM_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  LLM_FALLBACK_MODEL: z.string().optional(),
  LLM_MAX_RETRIES: int(4),
});

const pipelineSchema = z.object({
  LLM_CALL_DELAY_MS: int(3000),
  MAX_BRIEFS_PER_RUN: int(6),
  LLM_DAILY_CALL_BUDGET: int(100),
  LLM_DAILY_TOKEN_BUDGET: int(150000),
  RUN_TIME_BUDGET_MS: int(270000),
  APP_BASE_URL: z.url().default("http://localhost:3000"),
});

const telegramSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
});

const authSchema = z.object({
  DASHBOARD_PASSWORD: z.string().min(1),
  CRON_SECRET: z.string().min(16, "CRON_SECRET should be at least 16 characters"),
});

// Treat empty strings as unset so `.env` lines like `LLM_FALLBACK_MODEL=` fall back to defaults.
function cleanEnv(): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
}

function parser<T extends z.ZodType>(name: string, schema: T): () => z.infer<T> {
  let cached: z.infer<T> | undefined;
  return () => {
    if (cached) return cached;
    const result = schema.safeParse(cleanEnv());
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid ${name} environment: ${issues}`);
    }
    cached = result.data;
    return cached;
  };
}

export const supabaseEnv = parser("Supabase", supabaseSchema);
export const llmEnv = parser("LLM", llmSchema);
export const pipelineEnv = parser("pipeline", pipelineSchema);
export const authEnv = parser("auth", authSchema);

export function telegramEnv(): z.infer<typeof telegramSchema> | null {
  const result = telegramSchema.safeParse(cleanEnv());
  return result.success ? result.data : null;
}
