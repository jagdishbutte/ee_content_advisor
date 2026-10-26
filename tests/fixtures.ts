import type { Brief } from "@/lib/brief-schema";

export const validBrief: Brief = {
  headline: "TSMC lifts 2026 capex to $52 billion",
  hooks: ["Chip spending just hit a new record", "Why TSMC is betting big on AI", "The fab race is speeding up"],
  why_it_matters: "AI demand is reshaping the foundry market.",
  key_facts: [{ fact: "TSMC set capex at $52 billion", source_url: "https://example.com/a" }],
  carousel_slides: [1, 2, 3, 4, 5].map((n) => ({ slide_number: n, title: `Slide ${n}`, body: "Short body text.", suggested_visual: "Bar chart" })),
  suggested_chart: { type: "bar", title: "Capex by year", data_description: "2025 vs 2026 capex" },
  captions: { linkedin: "LinkedIn caption", instagram: "Instagram caption", x: "X caption" },
  hashtags: ["#semiconductors", "TSMC", "#AI"],
  source_credit_line: "Source: Example News https://example.com/a",
  recommended_platform: "linkedin",
  secondary_platform: "instagram",
  platform_reason: "Strategy story for business readers.",
  confidence: 0.8,
  needs_verification: false,
};
