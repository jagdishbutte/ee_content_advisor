import { createHash } from "node:crypto";

const STOP_WORDS = new Set(
  "a an the and or but of to in on for with at by from as is are was were be been it its this that these those into over after before about than vs new says said how why what will can could may".split(" "),
);

/** Lower-cased title words without punctuation or stop words; used for similarity. */
export function titleTokens(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .split(/[^a-z0-9.%$]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(words);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function contentHash(text: string): string {
  const normalised = text.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalised).digest("hex");
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function truncateWords(text: string, max: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= max ? words.join(" ") : `${words.slice(0, max).join(" ")} …`;
}
