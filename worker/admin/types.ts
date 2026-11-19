import type { Env } from "../env";
import type { AuthVariables } from "../auth/session";

export type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type AdminUserRow = {
  id: string;
  email: string;
  oauth_subject: string | null;
  created_at: string;
  disabled_at: string | null;
  sandbox_of: string | null;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  created_at: string;
  google_linked: boolean;
  disabled_at: string | null;
};

export type AdminUsageSummary = {
  tokensAllTime: number;
  tokens30d: number;
  freeJobs30d: number;
  byoJobs30d: number;
};

export type AdminUserDetail = {
  id: string;
  email: string;
  created_at: string;
  google_linked: boolean;
  disabled_at: string | null;
  counts: { decks: number; cards: number; jobs: number; materials: number };
  recentJobs: {
    id: string;
    status: string;
    created_at: string;
    finished_at: string | null;
    tokens_used?: number;
    tokens_prompt?: number;
    tokens_completion?: number;
    path?: "free" | "byo";
  }[];
  recentStudyDays: { day: string; intros_used: number }[];
  subjects: { id: string; title: string; created_at: string }[];
  decks: {
    id: string;
    title: string;
    subject_id: string | null;
    created_at: string;
  }[];
  materials: {
    id: string;
    deck_id: string;
    kind: string;
    filename: string | null;
    status: string;
    created_at: string;
  }[];
  studyPrefs: {
    intro_budget: number;
    review_budget: number;
    r_floor: number;
    updated_at: string;
  } | null;
  freeGenToday: { used: number; cap: number; remaining: number } | null;
  usage: AdminUsageSummary;
  cardSample: {
    id: string;
    type: string;
    status: string;
    frontPreview: string;
  }[];
};
