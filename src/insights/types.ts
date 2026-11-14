import type { SubjectKnowledgeBucketsAggregate } from "../study/subjectKnowledge";

export type InsightsGradeCounts = {
  again: number;
  hard: number;
  good: number;
  easy: number;
};

export type InsightsSummary = {
  window: { reviewsDays: 30; gradeDays: 14; activityDays: 90 };
  kpis: {
    reviewsInWindow: number;
    reviewedToday: number;
    avgRetrievability: number | null;
    etk: number | null;
    composition: SubjectKnowledgeBucketsAggregate;
  };
  gamification: {
    streakCurrent: number;
    streakBest: number;
    xpTotal: number;
    level: number;
  } | null;
  reviewsPerDay: Array<{ day: string; count: number }>;
  activityByDay: Array<{ day: string; count: number }>;
  gradeCounts: InsightsGradeCounts;
};
