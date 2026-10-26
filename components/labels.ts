import type { BriefStatus, Platform } from "@/lib/types";
import { pillars } from "@/config/pillars";

export const PLATFORM_LABEL: Record<Platform, string> = { linkedin: "LinkedIn", instagram: "Instagram", x: "X" };

export const STATUS_LABEL: Record<BriefStatus, string> = {
  suggested: "Suggested",
  selected_for_design: "Selected",
  designed: "Designed",
  posted: "Posted",
  rejected: "Rejected",
};

export const topicLabel = (id: string) => pillars.find((p) => p.id === id)?.label ?? id;

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "n/a";
