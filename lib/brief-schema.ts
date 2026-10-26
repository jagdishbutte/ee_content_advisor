// Shape of a content brief returned by the LLM. Word limits are enforced here so a brief that
// breaks them is rejected and retried rather than shown on the dashboard.
import { z } from "zod";
import { wordCount } from "./text";

const text = z.string().trim().min(1);
const maxWords = (max: number) => text.refine((s) => wordCount(s) <= max, `must be ${max} words or fewer`);

export const platformSchema = z.enum(["linkedin", "instagram", "x"]);

export const briefSchema = z.object({
  headline: maxWords(12),
  hooks: z.array(maxWords(14)).length(3),
  why_it_matters: text,
  key_facts: z.array(z.object({ fact: text, source_url: z.url() })).min(1).max(6),
  carousel_slides: z
    .array(z.object({ slide_number: z.number().int().min(1), title: text, body: maxWords(25), suggested_visual: text }))
    .min(5)
    .max(7),
  suggested_chart: z.object({ type: text, title: text, data_description: text }).nullable(),
  captions: z.object({ linkedin: text, instagram: text, x: text.max(280) }),
  hashtags: z.array(text).min(3).max(10),
  source_credit_line: text,
  // Nullable so a missing recommendation falls back to the deterministic platform rules.
  recommended_platform: platformSchema.nullable(),
  secondary_platform: platformSchema.nullable(),
  platform_reason: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  needs_verification: z.boolean(),
});

export type Brief = z.infer<typeof briefSchema>;
