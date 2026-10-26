// URL normalisation used for dedupe: lower-case host, drop "www.", fragments, tracking params,
// default ports and trailing slashes, and sort the remaining query params.

const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid", "yclid", "_hsenc", "_hsmi",
  "ref", "ref_src", "ref_url", "referrer", "source", "cmpid", "ncid", "ito", "guccounter", "spm",
  "smid", "share", "si", "utm",
]);

function isTrackingParam(name: string) {
  const n = name.toLowerCase();
  return n.startsWith("utm_") || n.startsWith("pk_") || n.startsWith("mtm_") || TRACKING_PARAMS.has(n);
}

export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  url.protocol = url.protocol === "http:" ? "https:" : url.protocol;
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hash = "";
  if (url.port === "80" || url.port === "443") url.port = "";

  const kept = [...url.searchParams.entries()].filter(([k]) => !isTrackingParam(k));
  kept.sort(([a], [b]) => a.localeCompare(b));
  url.search = new URLSearchParams(kept).toString();

  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "").replace(/\?$/, "");
}

export function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}
