/**
 * Cycle-safe study public surface for composition/infra (guest, api).
 * Must not re-export modules that import guest/ or resolve api/client (even
 * type-only): those edges poison CF worker graphs that touch this entry.
 * Worker insights stay on study leaves (allowlisted). Product UI uses ./index.ts.
 */
export type { StudyRating } from "./grading/studyRating";
export type {
  CardType,
  CardDraftView,
  OcclusionFrontView,
} from "./cardDraftView";
export {
  clearDueCache,
  saveDueCache,
  loadDueCache,
  pruneDueCacheCard,
  filterDueExcludingPending,
  dueCacheKey,
  dueScopeFromSearch,
} from "./queue/dueCache";
export {
  gradeColorVars,
  gradeChartFill,
} from "./grading/gradeColors";
export { GRADE_LABELS } from "./grading/gradeLabels";
export { pendingCardIdSet, clearPendingGrades, type PendingGrade } from "./grading/pendingGrades";
export { STUDY_MEDIA_CACHE } from "./media/studyMediaCache";
export {
  MATURE_INTERVAL_DAYS,
  classifyKnowledgeBucket,
  aggregateSubjectKnowledge,
  composeSubjectKnowledge,
  type SubjectKnowledgeBucketsAggregate,
  type SubjectKnowledge,
  type CompositionScheduleInput,
} from "./queue/subjectKnowledge";
export {
  clientLocalDay,
  serverUtcDayStartIso,
  resolveLocalDayStartIso,
} from "./localDay";
export {
  type EasyDay,
  localDayKey,
  applyLoadBalance,
} from "./queue/loadBalance";
export {
  clozeSpoken,
  blankClozeFront,
  revealClozeFront,
  extractClozeAnswer,
  extractClozeAnswers,
  clozeExtraSubtitle,
  composeClozeFront,
  parseClozeDiyFields,
  hasSingleClozeBlank,
  assertSingleCloze,
  CLOZE_BLANK_MAX,
  CLOZE_EXTRA_LABEL,
} from "./faces/clozeFormat";
export {
  buildDueHistogramFromDues,
} from "./queue/dueHistogram";
export { clampStudyPrefs, DEFAULT_STUDY_PREFS } from "./queue/policyPrefs";
export {
  type StudyPrefs,
  type QueueCandidate,
  type BuildStudyQueueOpts,
  buildStudyQueue,
} from "./queue/policyQueue";
export {
  cardHasRegenSource,
} from "./regenSource";
export {
  emptyFsrsCard,
  cardFromScheduleRow,
  retrievability,
  scheduleColumnsFromCard,
  type FsrsSchedulerCard,
} from "./fsrs/retrievability";
export {
  weaknessScore,
  rankWeakness,
  type WeaknessCandidate,
} from "./queue/weakness";
export {
  normalizeProvenancePages,
  mergeProvenancePagesIntoJson,
  pagesToPersistAfterRescue,
  pagesToPersistAfterSearchHits,
  pagesToPersistAfterNavigate,
  clampNotesPage,
} from "./notes/notesProvenanceWrite";
export {
  replayMemoryFromLogs,
  applyCutoverMemory,
} from "./fsrs/fsrsCutover";
export {
  schedulerForPrefs,
  clearSchedulerCache,
  clampLearningStep,
  type FsrsPrefs,
} from "./fsrs/fsrsFactory";
export {
  FSRS_MIN_REVIEWS,
} from "./fsrs/fsrsOptimizeConstants";
export { isOptimizeDue } from "./fsrs/fsrsOptimizeDue";
export type { FsrsOptimizeStatus } from "./fsrs/fsrsOptimizeTypes";
export {
  ratingToGrade,
  replayCardFromLogs,
  normalizeSchedulerCard,
  type ReviewLogReplayRow,
  type RescheduleSummary,
} from "./fsrs/fsrsReplay";
export {
  FSRS_W_LENGTH,
  validateFsrsW,
  parseFsrsWJson,
} from "./fsrs/fsrsWeights";
