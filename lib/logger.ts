// Minimal structured logger: one JSON line per event, easy to grep in Vercel / Actions logs.

type Level = "info" | "warn" | "error";

function write(level: Level, event: string, data: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => write("error", event, data),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
