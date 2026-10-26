import Link from "next/link";
import { getSource } from "@/config/sources";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardBrief } from "@/lib/dashboard";
import { BriefActions } from "./brief-actions";
import { PLATFORM_LABEL, STATUS_LABEL, formatDate, topicLabel } from "./labels";

export function BriefCard({ brief }: { brief: DashboardBrief }) {
  const j = brief.brief_json;
  const source = brief.item ? (getSource(brief.item.source_id)?.name ?? brief.item.source_id) : "Unknown source";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base leading-snug">
          <Link href={`/briefs/${brief.id}`} className="hover:underline">
            {j.headline}
          </Link>
        </CardTitle>
        <CardDescription>
          {source} · {formatDate(brief.item?.published_at ?? brief.created_at)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge>{PLATFORM_LABEL[brief.recommended_platform]}</Badge>
          <Badge variant="secondary">Score {brief.score === null ? "n/a" : Math.round(brief.score)}</Badge>
          {brief.status !== "suggested" && <Badge variant="outline">{STATUS_LABEL[brief.status]}</Badge>}
          {j.needs_verification && <Badge variant="destructive">Needs verification</Badge>}
          {brief.item?.topics.map((t) => (
            <Badge key={t} variant="outline">
              {topicLabel(t)}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{j.why_it_matters}</p>
      </CardContent>
      <CardFooter>
        <BriefActions id={brief.id} status={brief.status} feedback={brief.feedback} platform={brief.recommended_platform} />
      </CardFooter>
    </Card>
  );
}
