import type { SubjectKnowledgeBucketsAggregate } from "../study/subjectKnowledge";

export type InsightsGradeCounts = {
  again: number;
  hard: number;
  good: number;
  easy: number;
};

export type InsightsPassFail = {
  pass: number;
  fail: number;
  rate: number | null;
};

export type InsightsTrueRetention = {
  windowDays: 30;
  overall: InsightsPassFail;
  young: InsightsPassFail;
  mature: InsightsPassFail;
};

export type InsightsConsistency = {
  windowDays: 30;
  activeDays: number;
  intensity: number;
  /** Null when there is no study activity in the window. */
  score: number | null;
};

export type InsightsDifficultyMix = {
  easy: number;
  medium: number;
  hard: number;
  total: number;
};

export type InsightsStabilitySnapshot = {
  medianDays: number | null;
  bins: Array<{ label: string; count: number }>;
};

export type InsightsGradeByMaturity = {
  young: InsightsGradeCounts;
  mature: InsightsGradeCounts;
  learning: InsightsGradeCounts;
};

export type InsightsHourlySuccessPoint = {
  hour: number;
  pass: number;
  fail: number;
  rate: number | null;
};

export type InsightsSummary = {
  window: { reviewsDays: 30; gradeDays: 14; activityDays: 90 };
  kpis: {
    reviewsInWindow: number;
    reviewedToday: number;
    avgRetrievability: number | null;
    etk: number | null;
    composition: SubjectKnowledgeBucketsAggregate;
    dueToday: number;
    overdue: number;
    dailyLoad: number | null;
    trueRetention: InsightsTrueRetention;
    consistency: InsightsConsistency;
    difficulty: InsightsDifficultyMix;
    stability: InsightsStabilitySnapshot;
  };
  gamification: {
    streakCurrent: number;
    streakBest: number;
    xpTotal: number;
    level: number;
  } | null;
  reviewsPerDay: Array<{ day: string; count: number }>;
  activityByDay: Array<{ day: string; count: number }>;
  futureDue: Array<{ day: string; count: number }>;
  hourlySuccess: InsightsHourlySuccessPoint[];
  gradeCounts: InsightsGradeCounts;
  gradeCountsByMaturity: InsightsGradeByMaturity;
};
