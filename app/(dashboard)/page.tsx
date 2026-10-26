import { Suspense } from "react";
import { redirect } from "next/navigation";
import { z } from "zod";
import { pillars } from "@/config/pillars";
import { BriefCard } from "@/components/brief-card";
import { PLATFORM_LABEL, STATUS_LABEL } from "@/components/labels";
import { Button } from "@/components/ui/button";
import { listBriefs, type BriefFilters } from "@/lib/dashboard";
import { hasSession } from "@/lib/session";

const filterSchema = z.object({
  status: z.enum(["suggested", "selected_for_design", "designed", "posted", "rejected", "all"]).catch("suggested"),
  platform: z.enum(["linkedin", "instagram", "x"]).optional().catch(undefined),
  topic: z.string().optional().catch(undefined),
  sort: z.enum(["score", "new"]).catch("score"),
});

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-sm";

export default function BriefsPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Content briefs</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading briefs…</p>}>
        <Briefs searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Briefs({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  if (!(await hasSession())) redirect("/login");
  const raw = await searchParams;
  const filters: BriefFilters = filterSchema.parse({
    status: raw.status,
    platform: raw.platform || undefined,
    topic: raw.topic || undefined,
    sort: raw.sort,
  });
  const briefs = await listBriefs(filters);

  return (
    <>
      <form className="flex flex-wrap items-end gap-2" method="get">
        <select name="status" aria-label="Status" defaultValue={filters.status} className={selectClass}>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
          <option value="all">All statuses</option>
        </select>
        <select name="platform" aria-label="Platform" defaultValue={filters.platform ?? ""} className={selectClass}>
          <option value="">All platforms</option>
          {Object.entries(PLATFORM_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select name="topic" aria-label="Topic" defaultValue={filters.topic ?? ""} className={selectClass}>
          <option value="">All topics</option>
          {pillars.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <select name="sort" aria-label="Sort" defaultValue={filters.sort} className={selectClass}>
          <option value="score">Highest score</option>
          <option value="new">Newest</option>
        </select>
        <Button type="submit" size="sm" variant="outline">Apply</Button>
      </form>
      {briefs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No briefs match these filters yet. The pipeline runs every 6 hours, or use Run now on the Sources page.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {briefs.map((b) => (
            <BriefCard key={b.id} brief={b} />
          ))}
        </div>
      )}
    </>
  );
}
