// The only module that talks to the LLM: the official `openai` client pointed at any
// OpenAI-compatible endpoint (Groq by default). Output is always validated with Zod.
import OpenAI, { APIError } from "openai";
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { llmEnv } from "./env";
import { sleep } from "./http";
import { errorMessage, log } from "./logger";

export interface LlmUsage {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model: string;
}

export interface LlmResult<T> {
  data: T;
  usage: LlmUsage;
}

export type GenerateJson = <T>(schema: z.ZodType<T>, systemPrompt: string, userPrompt: string) => Promise<LlmResult<T>>;

const TEMPERATURE = 0.3;
const MAX_TOKENS = 2500;
const REASONING_MAX_TOKENS = 6000; // reasoning tokens count against this budget too
const MAX_BACKOFF_MS = 60_000;
const INVALID_JSON_RETRY = "Your last output was invalid JSON or did not match the schema. Return only valid JSON.";

export const isReasoningModel = (model: string) => /(gpt-oss|(^|\/)o\d|deepseek-r1|qwen3|reasoner)/i.test(model);

/** Strips markdown fences and any text around the outermost JSON object. */
export function extractJson(raw: string): string {
  const text = raw.replace(/```(?:json)?/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

export function parseJson<T>(schema: z.ZodType<T>, raw: string): { ok: true; data: T } | { ok: false; error: string } {
  let value: unknown;
  try {
    value = JSON.parse(extractJson(raw));
  } catch (err) {
    return { ok: false, error: `JSON parse: ${errorMessage(err)}` };
  }
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

/** Wait time for a 429: the server's retry-after if given, otherwise exponential backoff with jitter. */
export function backoffMs(attempt: number, headers?: Headers | null): number {
  const ms = Number(headers?.get("retry-after-ms"));
  if (ms > 0) return Math.min(ms, MAX_BACKOFF_MS);
  const sec = Number(headers?.get("retry-after"));
  if (sec > 0) return Math.min(sec * 1000, MAX_BACKOFF_MS);
  return Math.min(2000 * 2 ** attempt + Math.random() * 500, MAX_BACKOFF_MS);
}

let client: OpenAI | null = null;
let jsonSchemaUnsupported = false; // flipped once if the endpoint rejects json_schema

function getClient(): OpenAI {
  const env = llmEnv();
  client ??= new OpenAI({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL, maxRetries: 0, timeout: 90_000 });
  return client;
}

const isRetryable = (err: unknown) => err instanceof APIError && (err.status === 429 || (err.status ?? 0) >= 500);

async function complete(model: string, messages: ChatCompletionMessageParam[], jsonSchema: Record<string, unknown>, usage: LlmUsage): Promise<string> {
  const { LLM_MAX_RETRIES } = llmEnv();
  for (let attempt = 0; ; attempt++) {
    const params: ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      temperature: TEMPERATURE,
      response_format: jsonSchemaUnsupported
        ? { type: "json_object" }
        : { type: "json_schema", json_schema: { name: "response", schema: jsonSchema, strict: false } },
      ...(isReasoningModel(model)
        ? { reasoning_effort: "low" as const, max_completion_tokens: REASONING_MAX_TOKENS }
        : { max_tokens: MAX_TOKENS }),
    };
    try {
      const res = await getClient().chat.completions.create(params);
      usage.calls++;
      usage.prompt_tokens += res.usage?.prompt_tokens ?? 0;
      usage.completion_tokens += res.usage?.completion_tokens ?? 0;
      usage.total_tokens += res.usage?.total_tokens ?? 0;
      log.info("llm.call", { model, attempt, usage: res.usage ?? null, finish: res.choices[0]?.finish_reason });
      return res.choices[0]?.message?.content ?? "";
    } catch (err) {
      if (!jsonSchemaUnsupported && err instanceof APIError && err.status === 400 && /response_format|json_schema/i.test(err.message)) {
        log.warn("llm.json_schema_unsupported", { model, error: err.message });
        jsonSchemaUnsupported = true;
        continue;
      }
      if (isRetryable(err) && attempt < LLM_MAX_RETRIES) {
        const wait = backoffMs(attempt, (err as APIError).headers);
        log.warn("llm.retry", { model, status: (err as APIError).status, attempt, waitMs: Math.round(wait) });
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
}

async function generateWithModel<T>(model: string, schema: z.ZodType<T>, systemPrompt: string, userPrompt: string, usage: LlmUsage): Promise<T> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  const first = await complete(model, messages, jsonSchema, usage);
  const parsed = parseJson(schema, first);
  if (parsed.ok) return parsed.data;

  log.warn("llm.invalid_output", { model, error: parsed.error });
  messages.push({ role: "assistant", content: first }, { role: "user", content: `${INVALID_JSON_RETRY} Problems: ${parsed.error}` });
  const second = parseJson(schema, await complete(model, messages, jsonSchema, usage));
  if (second.ok) return second.data;
  throw new Error(`LLM output invalid after retry: ${second.error}`);
}

/** Calls the main model, then LLM_FALLBACK_MODEL (if set) when the main model keeps failing. */
export const generateJson: GenerateJson = async (schema, systemPrompt, userPrompt) => {
  const env = llmEnv();
  const models = [env.LLM_MODEL, env.LLM_FALLBACK_MODEL].filter((m): m is string => !!m);
  const usage: LlmUsage = { calls: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, model: models[0] };
  let lastError: unknown;
  for (const model of models) {
    usage.model = model;
    try {
      const data = await generateWithModel(model, schema, systemPrompt, userPrompt, usage);
      log.info("llm.done", { ...usage });
      return { data, usage };
    } catch (err) {
      lastError = err;
      log.warn("llm.model_failed", { model, error: errorMessage(err) });
    }
  }
  throw Object.assign(new Error(`LLM failed: ${errorMessage(lastError)}`), { usage });
};
