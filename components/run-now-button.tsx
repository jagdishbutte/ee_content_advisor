"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RunNowButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    setBusy(true);
    setMessage("Running the pipeline. This can take a few minutes…");
    const res = await fetch("/api/run-now", { method: "POST" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string; stats?: Record<string, unknown> } | null;
    setBusy(false);
    setMessage(res?.ok ? "Run finished." : `Run failed: ${body?.error ?? "network error"}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={run} disabled={busy}>
        <Play />
        {busy ? "Running…" : "Run now"}
      </Button>
      {message && <p className="text-sm text-muted-foreground" aria-live="polite">{message}</p>}
    </div>
  );
}
