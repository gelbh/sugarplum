import { guestInsightsSummary } from "../guest/insights";
import { isGuest } from "../guest/session";
import type { InsightsSummary } from "../insights/types";
import { clientLocalDay } from "../study/localDay";
import { api } from "./core";

export type GetInsightsSummaryOpts = {
  tzOffsetMinutes?: number;
  localDay?: string;
};

export function getInsightsSummary(
  opts?: GetInsightsSummaryOpts,
): Promise<InsightsSummary> {
  const tzOffsetMinutes =
    opts?.tzOffsetMinutes ?? new Date().getTimezoneOffset();
  const localDay = opts?.localDay ?? clientLocalDay();
  if (isGuest()) {
    return Promise.resolve(
      guestInsightsSummary({ tzOffsetMinutes, now: new Date() }),
    );
  }
  const params = new URLSearchParams();
  params.set("tzOffsetMinutes", String(tzOffsetMinutes));
  params.set("localDay", localDay);
  return api<InsightsSummary>(`/api/insights/summary?${params}`);
}
