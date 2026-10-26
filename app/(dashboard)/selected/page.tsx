import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BriefCard } from "@/components/brief-card";
import { DownloadButton } from "@/components/download-button";
import { listBriefs } from "@/lib/dashboard";
import { briefsToMarkdown } from "@/lib/export";
import { hasSession } from "@/lib/session";

export default function SelectedPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Selected for design</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Selected />
      </Suspense>
    </div>
  );
}

async function Selected() {
  if (!(await hasSession())) redirect("/login");
  const briefs = await listBriefs({ status: "selected_for_design", sort: "score" });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div>
        <DownloadButton content={briefsToMarkdown(briefs)} filename={`elevate-edge-briefs-${today}.md`} label="Export markdown" />
      </div>
      {briefs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing selected yet. Use Select on a brief to add it here.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {briefs.map((b) => <BriefCard key={b.id} brief={b} />)}
        </div>
      )}
    </>
  );
}
