"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BriefStatus, Feedback, Platform } from "@/lib/types";
import { PLATFORM_LABEL } from "./labels";

interface Props {
  id: string;
  status: BriefStatus;
  feedback: Feedback | null;
  platform: Platform;
}

export function BriefActions({ id, status, feedback, platform }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [postTo, setPostTo] = useState<Platform>(platform);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/briefs/${id}`, { method: "POST", body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh();
    else setError("Action failed. Try again.");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {status !== "selected_for_design" && status !== "posted" && (
          <Button size="sm" disabled={busy} onClick={() => send({ action: "status", status: "selected_for_design" })}>
            Select
          </Button>
        )}
        {status !== "rejected" && status !== "posted" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => send({ action: "status", status: "rejected" })}>
            Reject
          </Button>
        )}
        {(status === "rejected" || status === "selected_for_design") && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => send({ action: "status", status: "suggested" })}>
            Back to suggested
          </Button>
        )}
        <Button
          size="icon-sm"
          variant={feedback === "up" ? "default" : "outline"}
          aria-label="Thumbs up"
          aria-pressed={feedback === "up"}
          disabled={busy}
          onClick={() => send({ action: "feedback", feedback: feedback === "up" ? null : "up" })}
        >
          <ThumbsUp />
        </Button>
        <Button
          size="icon-sm"
          variant={feedback === "down" ? "destructive" : "outline"}
          aria-label="Thumbs down"
          aria-pressed={feedback === "down"}
          disabled={busy}
          onClick={() => send({ action: "feedback", feedback: feedback === "down" ? null : "down" })}
        >
          <ThumbsDown />
        </Button>
      </div>
      {status !== "posted" && status !== "rejected" && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Platform posted to"
            className="h-7 rounded-md border border-input bg-background px-2 text-sm"
            value={postTo}
            onChange={(e) => setPostTo(e.target.value as Platform)}
          >
            {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABEL[p]}
              </option>
            ))}
          </select>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => send({ action: "posted", platform: postTo })}>
            Mark posted
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
