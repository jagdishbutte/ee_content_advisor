import { Suspense } from "react";
import { redirect } from "next/navigation";
import { sources } from "@/config/sources";
import { formatDate } from "@/components/labels";
import { RunNowButton } from "@/components/run-now-button";
import { Badge } from "@/components/ui/badge";
import { listSourceRows, recentRuns } from "@/lib/dashboard";
import { hasSession } from "@/lib/session";

export default function SourcesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Sources and runs</h1>
        <RunNowButton />
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <SourcesAndRuns />
      </Suspense>
    </div>
  );
}

async function SourcesAndRuns() {
  if (!(await hasSession())) redirect("/login");
  const [rows, runs] = await Promise.all([listSourceRows(), recentRuns()]);
  const byId = new Map(rows.map((r) => [r.id, r]));

  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1 pr-3">Started</th><th className="pr-3">Trigger</th><th className="pr-3">Stats</th><th className="pr-3">LLM</th><th>Errors</th></tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="py-1 pr-3 whitespace-nowrap">{formatDate(r.started_at)}{r.finished_at ? "" : " (running)"}</td>
                    <td className="pr-3">{r.trigger}</td>
                    <td className="pr-3 text-xs">{Object.entries(r.stats ?? {}).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(", ")}</td>
                    <td className="pr-3 whitespace-nowrap">{r.llm_calls} calls, {r.llm_tokens} tok</td>
                    <td>{r.errors?.length ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Sources</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-1 pr-3">Source</th><th className="pr-3">Type</th><th className="pr-3">Feed</th><th className="pr-3">Last polled</th><th>Status</th></tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const row = byId.get(s.id);
                return (
                  <tr key={s.id} className="border-t align-top">
                    <td className="py-1 pr-3">
                      <a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.name}</a>
                      {!s.enabled && <Badge variant="outline" className="ml-1">disabled</Badge>}
                    </td>
                    <td className="pr-3">{s.type}</td>
                    <td className="pr-3">{s.feedStatus}</td>
                    <td className="pr-3 whitespace-nowrap">{formatDate(row?.last_polled_at ?? null)}</td>
                    <td>
                      {row?.last_status ?? "never"}
                      {row?.last_error && <p className="text-xs text-destructive">{row.last_error}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
