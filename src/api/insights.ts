import { enrichGuestStoreScheduledDays } from "../guest/enrichScheduledDays";
import { guestInsightsSummary } from "../guest/insights";
import { isGuest } from "../guest/session";
import {
  isInsightsRangePreset,
  type InsightsRangePreset,
} from "../insights/buildSeries";
import type { InsightsSummary } from "../insights/types";
import { clientLocalDay } from "../study/kernel";
import { api } from "./core";

export type GetInsightsSummaryOpts = {
  tzOffsetMinutes?: number;
  localDay?: string;
  rangeDays?: InsightsRangePreset;
};

export function getInsightsSummary(
  opts?: GetInsightsSummaryOpts,
): Promise<InsightsSummary> {
  const tzOffsetMinutes =
    opts?.tzOffsetMinutes ?? new Date().getTimezoneOffset();
  const localDay = opts?.localDay ?? clientLocalDay();
  const rangeDays: InsightsRangePreset =
    opts?.rangeDays != null && isInsightsRangePreset(opts.rangeDays)
      ? opts.rangeDays
      : 30;
  if (isGuest()) {
    return enrichGuestStoreScheduledDays().then(() =>
      guestInsightsSummary({
        tzOffsetMinutes,
        now: new Date(),
        rangeDays,
      }),
    );
  }
  const params = new URLSearchParams();
  params.set("tzOffsetMinutes", String(tzOffsetMinutes));
  params.set("localDay", localDay);
  params.set("rangeDays", String(rangeDays));
  return api<InsightsSummary>(`/api/insights/summary?${params}`);
}
