import { guestInsightsSummary } from "../guest/insights";
import { isGuest } from "../guest/session";
import type { InsightsSummary } from "../insights/types";
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
  if (isGuest()) {
    return Promise.resolve(
      guestInsightsSummary({ tzOffsetMinutes }),
    );
  }
  const params = new URLSearchParams();
  params.set("tzOffsetMinutes", String(tzOffsetMinutes));
  if (opts?.localDay) params.set("localDay", opts.localDay);
  const q = params.toString();
  return api<InsightsSummary>(`/api/insights/summary${q ? `?${q}` : ""}`);
}
