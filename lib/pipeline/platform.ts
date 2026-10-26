// Stage 6: platform recommendation. The LLM suggests one; these deterministic rules (the same ones the
// prompt describes) fill in when it gives none, or when its secondary platform repeats the primary.
import { getSource } from "@/config/sources";
import type { Brief } from "@/lib/brief-schema";
import type { Platform } from "@/lib/types";
import type { BriefCandidate } from "./brief";

const BREAKING_HOURS = 12;
const BUSINESS_WORDS = /\b(strateg|policy|regulat|tariff|export control|invest|funding|acquisi|merger|earnings|revenue|supply chain|capex|partnership|government|subsid)/i;
const BREAKING_WORDS = /\b(breaking|just in|announces?|launch(es|ed)?|unveils?|confirms?)\b/i;

export interface PlatformChoice {
  recommended: Platform;
  secondary: Platform;
  reason: string;
}

export type PlatformedBrief = Brief & { recommended_platform: Platform; secondary_platform: Platform; platform_reason: string };

/** Rule-based platform pick from the brief and its source item. */
export function recommendPlatform(brief: Brief, item: BriefCandidate, now = Date.now()): PlatformChoice {
  const text = `${item.title} ${brief.headline} ${brief.why_it_matters}`;
  const ageHours = item.published_at ? (now - Date.parse(item.published_at)) / 3_600_000 : Infinity;
  const isData = getSource(item.source_id)?.type === "data";
  const visual = isData || (brief.suggested_chart !== null && brief.key_facts.some((f) => /\d/.test(f.fact)));
  const business = BUSINESS_WORDS.test(text);
  const breaking = ageHours <= BREAKING_HOURS && BREAKING_WORDS.test(text);

  if (breaking && !visual) return { recommended: "x", secondary: business ? "linkedin" : "instagram", reason: "Fresh, fast-moving news best told in one sharp point." };
  if (visual && !business) return { recommended: "instagram", secondary: "linkedin", reason: "Data-led story that works as a chart carousel." };
  if (business) return { recommended: "linkedin", secondary: visual ? "instagram" : "x", reason: "Business and strategy angle suits a professional audience." };
  return { recommended: "linkedin", secondary: "instagram", reason: "Industry analysis suits LinkedIn; slides can be reused on Instagram." };
}

/** Keeps the LLM's choice when valid; otherwise applies the rules. */
export function applyPlatform(brief: Brief, item: BriefCandidate, now = Date.now()): PlatformedBrief {
  const rules = recommendPlatform(brief, item, now);
  const primary = brief.recommended_platform;
  if (!primary) {
    return { ...brief, recommended_platform: rules.recommended, secondary_platform: rules.secondary, platform_reason: rules.reason };
  }
  const secondary =
    brief.secondary_platform && brief.secondary_platform !== primary
      ? brief.secondary_platform
      : rules.recommended !== primary
        ? rules.recommended
        : rules.secondary;
  return { ...brief, recommended_platform: primary, secondary_platform: secondary, platform_reason: brief.platform_reason || rules.reason };
}
