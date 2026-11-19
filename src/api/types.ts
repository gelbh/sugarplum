import type { GuestHubCardBody } from "../guest/store";
import type { AchievementItem, UnlockView } from "../achievements/wire";
import type { SourceRole } from "../lib/sourceRole";

export type {
  SubjectKnowledge,
  SubjectKnowledgeBucketsAggregate,
} from "../study/subjectKnowledge";
export type { SubjectCompositionSummary } from "../guest/composition";
export type { FsrsOptimizeStatus } from "../study/fsrsOptimizeTypes";
export type { InsightsGradeCounts, InsightsSummary } from "../insights/types";

export type AuthUser = {
  id: string;
  email: string;
  google_linked?: boolean;
  is_admin?: boolean;
  /** Worker `ANATOMY_VIEWER_EMAILS` allowlist; missing → treat as false. */
  anatomy_viewer?: boolean;
  impersonation?: {
    sourceUserId: string;
    sourceEmail: string;
    startedAt: number;
    expiresAt?: number;
  } | null;
};

export type CalendarStatus = {
  connected: boolean;
  suggestions: boolean;
  gaps: boolean;
  reconnect: boolean;
};

export type CalendarSuggestion = {
  clusterKey: string;
  title: string;
  evidence: string;
  linkSubjectId: string | null;
};

export type CalendarSuggestions = {
  subjects: CalendarSuggestion[];
  decksBySubjectId: Record<string, string[]>;
};

export type AdminOverview = {
  userCount: number;
  createdLast7d: number;
  tokens30d: number;
  freeJobs30d: number;
  byoJobs30d: number;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  created_at: string;
  google_linked: boolean;
  disabled_at: string | null;
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
  usage: {
    tokensAllTime: number;
    tokens30d: number;
    freeJobs30d: number;
    byoJobs30d: number;
  };
  cardSample: {
    id: string;
    type: string;
    status: string;
    frontPreview: string;
  }[];
};

export type Subject = {
  id: string;
  title: string;
  created_at: string;
  deck_count?: number;
};

export type Deck = {
  id: string;
  title: string;
  subject_id: string;
  /** Unused after hierarchy migrate; kept optional for compat. */
  subject_hint?: string | null;
  created_at: string;
};

export type DeckStats = {
  accepted: number;
  draft: number;
  archived: number;
  materials: number;
};

export type Material = {
  id: string;
  deck_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
  source_role?: SourceRole;
};

export type MaterialListItem = Material & {
  deck_title?: string;
};

export type CoverOwnerKind = "subject" | "deck";

export type CoverSource = "unsplash" | "custom";

export type CoverFields = {
  photoId: string;
  imageUrl: string;
  photographerName: string;
  photographerUrl: string;
  photoHtmlUrl: string;
};

export type StoredCoverRow = {
  ownerKind: CoverOwnerKind;
  ownerId: string;
  photoId: string;
  imageUrl: string;
} & (
  | {
      source: "unsplash";
      photographerName: string;
      photographerUrl: string;
      photoHtmlUrl: string;
    }
  | {
      source: "custom";
      r2Key: string;
    }
);

export type CoverUploadUrlResponse = {
  imageId: string;
  uploadUrl: string;
  r2Key: string;
};

export type ListDeckCardsOpts = { status?: "archived" };

export type HubCreateCardBody =
  | GuestHubCardBody
  | {
      type: "image_label";
      front: string;
      back: string;
      media_r2_keys: string[];
    }
  | {
      type: "occlusion";
      front: OcclusionFrontView;
      back: { answer: string };
    };

export type PasteMaterialResponse = Material & {
  jobId: string;
  reused?: boolean;
};

export type GenerationJobProgress = {
  stage: string;
  current: number;
  total: number;
  percent: number;
  label: string;
  /** ISO progress heartbeat (aligns client poll timeout with server stale). */
  updated_at?: string;
  /** ISO when pipeline work first started (durable ETA clock). */
  started_at?: string;
  tokens_used?: number;
  tokens_prompt?: number;
  tokens_completion?: number;
  drafts_so_far?: number;
  events?: {
    at: string;
    kind: "excerpt" | "draft" | "stage";
    stage: string;
    text: string;
  }[];
  path?: "free" | "byo";
};

export type GenerationJob = {
  id: string;
  material_id: string;
  status: string;
  error: string | null;
  coverage_json: string | null;
  progress: GenerationJobProgress | null;
  free_quota: { used: number; cap: number; remaining: number } | null;
  created_at: string;
  finished_at: string | null;
  /** Deck/subject for draft-review crumbs (GET /api/jobs/:id). */
  deck_id?: string;
  deck_title?: string;
  subject_id?: string | null;
  subject_title?: string | null;
};

export type RegenCardType = "qa" | "cloze" | "mcq";

export type JobListItem = {
  id: string;
  status: string;
  draft_count: number;
  deck_id: string;
  deck_title: string;
  filename: string | null;
  created_at: string;
};

export type ClaimCoverageRow = {
  id: string;
  subject: string;
  predicate: string;
  object?: string | null;
  source_span: string;
  pages?: number[] | null;
  card_id: string | null;
  card_status?: string | null;
};

export type ClaimCoverage = {
  claims: ClaimCoverageRow[];
  summary: { total: number; linked: number; orphan: number };
};

export type UploadUrlResponse = {
  materialId: string;
  uploadUrl: string;
  r2Key: string;
};

export type CompleteMaterialResponse = Material & {
  jobId: string | null;
  reused?: boolean;
  manual_occlusion?: boolean;
};

export type FigureExtractMode = "fast" | "accurate";

export type LlmSettingsConfigured = {
  provider: string;
  last4: string;
  model: string | null;
  configured: true;
};

export type LlmSettingsMissing = {
  configured: false;
};

export type LlmSettings = LlmSettingsConfigured | LlmSettingsMissing;

export type StudyPrefs = {
  introBudget: number;
  reviewBudget: number;
  rFloor: number;
  desiredRetention: number;
  enableFuzz: boolean;
  enableLoadBalance: boolean;
  easyDays: Array<"normal" | "reduced" | "minimum">;
};

export type FsrsRescheduleSummary = {
  cardsUpdated: number;
  cardsSkipped: number;
};

export type AchievementsResponse = {
  items: AchievementItem[];
};

export type GamificationResponse = {
  streakCurrent: number;
  streakBest: number;
  streakDay: string | null;
  xpTotal: number;
  level: number;
  displayName: string | null;
  boardOptIn: boolean;
};

export type LeaderboardResponse = {
  weekKey: string;
  entries: Array<{
    userId: string;
    displayName: string | null;
    xp: number;
  }>;
};

export type OcclusionFrontView = {
  image_key: string;
  prompt?: string;
  regions: Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
  }>;
  mode: "hide_one";
};

export type CardType =
  "qa" | "cloze" | "image_label" | "diagram" | "mcq" | "occlusion";

export type CardDraftView = {
  id: string;
  deck_id: string;
  job_id: string | null;
  type: CardType | string;
  front: string | OcclusionFrontView;
  back: string | { answer: string };
  options?: string[];
  media_r2_keys?: string[];
  provenance: unknown;
  status: string;
  created_at: string;
  updated_at: string;
  due?: string;
};

export type JourneyStatus = {
  deckCount: number;
  hasGenerationJob: boolean;
  openReviewJobId: string | null;
  /** Latest queued/running/failed job; Review stays incomplete until settled. */
  pendingGenerationJobId: string | null;
  acceptedCount: number;
  dueCount: number;
};

export type JourneyGenerationStatus = Pick<
  JourneyStatus,
  "openReviewJobId" | "pendingGenerationJobId"
>;

export type AcceptCardResult = CardDraftView & { unlocks?: UnlockView[] };

export type ListDueOpts = {
  deckId?: string;
  subjectId?: string;
  /** Minutes from local to UTC (`Date#getTimezoneOffset`). */
  tzOffsetMinutes?: number;
  /** Client local calendar day `YYYY-MM-DD`. */
  localDay?: string;
  /** Extra intro slices for Study more (nonneg int). */
  introBonus?: number;
};

export type StudyQueueMeta = {
  introUsed: number;
  introBudget: number;
  introAlreadyUsedToday?: number;
  introRemaining?: number;
  reviewUsed: number;
  reviewBudget: number;
  heldIntroCount: number;
  deferredCount: number;
};

export type ListDueResult = {
  cards: CardDraftView[];
  meta: StudyQueueMeta;
  pendingDeferrals?: { id: string; newDue: string }[];
};

export type StrugglingRow = {
  id: string;
  deck_id: string;
  type: string;
  front_preview: string;
  lapses: number;
  again_14d: number;
  hard_14d: number;
  difficulty: number;
  due: string;
  is_due: boolean;
  retrievability?: number | null;
  has_regen_source: boolean;
};

export type StudyRating = 1 | 2 | 3 | 4;

export type ReviewResult = {
  due: string;
  state: number;
  unlocks?: UnlockView[];
};

export type ExportWarnings = {
  missingMedia: number;
  skippedCards: number;
};

export type ExportJobView = {
  id: string;
  status: string;
  warnings: ExportWarnings;
  downloadPath: string | null;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
};

export type CreateDeckExportResponse = {
  id: string;
  status: string;
  warnings: ExportWarnings;
  downloadPath: string | null;
};

export type CreateExportBody =
  | { type: "deck"; deckId: string }
  | { type: "subject"; subjectId: string }
  | { type: "selection"; deckIds: string[]; subjectIds: string[] };
