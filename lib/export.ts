// Markdown export of selected briefs, handed to the designer.
import type { DashboardBrief } from "./dashboard";

const PLATFORM_LABEL = { linkedin: "LinkedIn", instagram: "Instagram", x: "X" } as const;

export function briefToMarkdown(b: DashboardBrief): string {
  const j = b.brief_json;
  const lines = [
    `## ${j.headline}`,
    "",
    `**Platform:** ${PLATFORM_LABEL[b.recommended_platform]}${j.secondary_platform ? ` (secondary: ${PLATFORM_LABEL[j.secondary_platform]})` : ""}`,
    `**Score:** ${b.score ?? "n/a"} · **Confidence:** ${Math.round(j.confidence * 100)}%${j.needs_verification ? " · ⚠️ Needs verification" : ""}`,
    `**Source:** ${b.item?.canonical_url ?? b.item?.url ?? "n/a"}`,
    "",
    "### Hooks",
    ...j.hooks.map((h) => `- ${h}`),
    "",
    "### Why it matters",
    j.why_it_matters,
    "",
    "### Key facts",
    ...j.key_facts.map((f) => `- ${f.fact} ([source](${f.source_url}))`),
    "",
    "### Carousel",
    ...j.carousel_slides.map((s) => `${s.slide_number}. **${s.title}**: ${s.body}\n   - Visual: ${s.suggested_visual}`),
  ];
  if (j.suggested_chart) {
    lines.push("", "### Chart", `- **${j.suggested_chart.title}** (${j.suggested_chart.type}): ${j.suggested_chart.data_description}`);
  }
  lines.push(
    "",
    "### Captions",
    `**LinkedIn**\n\n${j.captions.linkedin}`,
    "",
    `**Instagram**\n\n${j.captions.instagram}`,
    "",
    `**X**\n\n${j.captions.x}`,
    "",
    `**Hashtags:** ${j.hashtags.join(" ")}`,
    "",
    `_${j.source_credit_line}_`,
  );
  return lines.join("\n");
}

export function briefsToMarkdown(briefs: DashboardBrief[], date = new Date()): string {
  const header = `# Elevate Edge: selected briefs (${date.toISOString().slice(0, 10)})`;
  if (briefs.length === 0) return `${header}\n\nNo briefs selected.\n`;
  return `${header}\n\n${briefs.map(briefToMarkdown).join("\n\n---\n\n")}\n`;
}
