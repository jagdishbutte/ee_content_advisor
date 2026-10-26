import { Suspense, type ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getSource } from "@/config/sources";
import { BriefActions } from "@/components/brief-actions";
import { CopyButton } from "@/components/copy-button";
import { PLATFORM_LABEL, STATUS_LABEL, formatDate, topicLabel } from "@/components/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBrief } from "@/lib/dashboard";
import { briefToMarkdown } from "@/lib/export";
import { hasSession } from "@/lib/session";

const BREAKDOWN_LABEL: Record<string, string> = {
  pillar: "Pillar relevance",
  freshness: "Freshness",
  authority: "Source authority",
  corroboration: "Corroboration",
  visual: "Visual potential",
  novelty_penalty: "Novelty penalty",
  feedback: "Feedback offset",
  total: "Total",
};

export default function BriefPage({ params }: PageProps<"/briefs/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading brief…</p>}>
      <BriefDetail params={params} />
    </Suspense>
  );
}

function Section({ title, copy, children }: { title: string; copy?: string; children: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {copy && <CopyButton text={copy} />}
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  );
}

async function BriefDetail({ params }: { params: PageProps<"/briefs/[id]">["params"] }) {
  if (!(await hasSession())) redirect("/login");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const brief = await getBrief(id);
  if (!brief) notFound();

  const j = brief.brief_json;
  const sourceUrl = brief.item?.canonical_url ?? brief.item?.url;
  const sourceName = brief.item ? (getSource(brief.item.source_id)?.name ?? brief.item.source_id) : "Unknown source";
  const breakdown = Object.entries(brief.item?.score_breakdown ?? {});

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold leading-snug">{j.headline}</h1>
        <p className="text-sm text-muted-foreground">
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline">{sourceName}</a>
          ) : sourceName}{" "}
          · {formatDate(brief.item?.published_at ?? brief.created_at)}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge>{PLATFORM_LABEL[brief.recommended_platform]}</Badge>
          {j.secondary_platform && <Badge variant="outline">Also: {PLATFORM_LABEL[j.secondary_platform]}</Badge>}
          <Badge variant="secondary">{STATUS_LABEL[brief.status]}</Badge>
          <Badge variant="secondary">Confidence {Math.round(j.confidence * 100)}%</Badge>
          {j.needs_verification && <Badge variant="destructive">Needs verification</Badge>}
          {brief.item?.topics.map((t) => <Badge key={t} variant="outline">{topicLabel(t)}</Badge>)}
        </div>
        {brief.platform_reason && <p className="text-sm text-muted-foreground">{brief.platform_reason}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <BriefActions id={brief.id} status={brief.status} feedback={brief.feedback} platform={brief.recommended_platform} />
          <CopyButton text={briefToMarkdown(brief)} label="Copy as markdown" />
        </div>
      </div>

      <Section title="Hooks" copy={j.hooks.join("\n")}>
        <ol className="list-decimal space-y-1 pl-5">{j.hooks.map((h) => <li key={h}>{h}</li>)}</ol>
      </Section>

      <Section title="Why it matters">
        <p>{j.why_it_matters}</p>
      </Section>

      <Section title="Key facts">
        <ul className="list-disc space-y-1 pl-5">
          {j.key_facts.map((f) => (
            <li key={f.fact}>
              {f.fact}{" "}
              <a href={f.source_url} target="_blank" rel="noreferrer" className="text-muted-foreground underline">source</a>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Carousel slides">
        <ol className="space-y-3">
          {j.carousel_slides.map((s) => (
            <li key={s.slide_number}>
              <p className="font-medium">{s.slide_number}. {s.title}</p>
              <p>{s.body}</p>
              <p className="text-muted-foreground">Visual: {s.suggested_visual}</p>
            </li>
          ))}
        </ol>
        {j.suggested_chart && (
          <p className="mt-3 text-muted-foreground">
            Chart ({j.suggested_chart.type}): {j.suggested_chart.title}. {j.suggested_chart.data_description}
          </p>
        )}
      </Section>

      {(["linkedin", "instagram", "x"] as const).map((p) => (
        <Section key={p} title={`${PLATFORM_LABEL[p]} caption`} copy={j.captions[p]}>
          <p className="whitespace-pre-line">{j.captions[p]}</p>
        </Section>
      ))}

      <Section title="Hashtags" copy={j.hashtags.join(" ")}>
        <p>{j.hashtags.join(" ")}</p>
      </Section>

      <Section title="Credit line" copy={j.source_credit_line}>
        <p>{j.source_credit_line}</p>
      </Section>

      <Section title="Score breakdown">
        {breakdown.length === 0 ? (
          <p className="text-muted-foreground">No breakdown recorded.</p>
        ) : (
          <table className="w-full max-w-sm">
            <tbody>
              {breakdown.map(([k, v]) => (
                <tr key={k} className={k === "total" ? "border-t font-medium" : undefined}>
                  <td className="py-1">{BREAKDOWN_LABEL[k] ?? k}</td>
                  <td className="py-1 text-right tabular-nums">{Number(v).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
