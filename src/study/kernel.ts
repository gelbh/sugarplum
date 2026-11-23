/**
 * Cycle-safe study public surface for composition/infra (guest, api).
 * Must not re-export modules that import guest/ or resolve api/client (even
 * type-only): those edges poison CF worker graphs that touch this entry.
 * Worker insights stay on study leaves (allowlisted). Product UI uses ./index.ts.
 */
export { pendingCardIdSet, clearPendingGrades, type PendingGrade } from "./pendingGrades";
export { STUDY_MEDIA_CACHE } from "./studyMediaCache";
export {
  MATURE_INTERVAL_DAYS,
  classifyKnowledgeBucket,
  aggregateSubjectKnowledge,
  composeSubjectKnowledge,
  type SubjectKnowledgeBuckets,
  type SubjectKnowledgeBucketsAggregate,
  type SubjectKnowledge,
  type CompositionScheduleInput,
} from "./subjectKnowledge";
export {
  clientLocalDay,
  serverUtcDay,
  serverUtcDayStartIso,
  resolveLocalDayStartIso,
} from "./localDay";
export {
  type EasyDay,
  localDayKey,
  applyLoadBalance,
} from "./loadBalance";
export {
  clozeSpoken,
  clozeParts,
  blankClozeFront,
  revealClozeFront,
  extractClozeAnswer,
  extractClozeAnswers,
  clozeExtraSubtitle,
  composeClozeFront,
  parseClozeDiyFields,
  hasClozeBlank,
  hasSingleClozeBlank,
  assertSingleCloze,
  CLOZE_BLANK_MAX,
  CLOZE_EXTRA_LABEL,
} from "./clozeFormat";
export {
  buildDueHistogramFromDues,
  type DueHistogramBuckets,
} from "./dueHistogram";
export { clampStudyPrefs, DEFAULT_STUDY_PREFS } from "./policyPrefs";
export {
  type StudyPrefs,
  type QueueCandidate,
  type QueueResult,
  type BuildStudyQueueOpts,
  isIntroEligible,
  buildStudyQueue,
} from "./policyQueue";
export {
  parseProvenanceJson,
  provenanceExcerptText,
  provenancePages,
  cardHasRegenSource,
} from "./regenSource";
export {
  emptyFsrsCard,
  cardFromScheduleRow,
  warmRetrievabilityModels,
  retrievability,
  scheduleColumnsFromCard,
  type ScheduleRowLike,
  type FsrsSchedulerCard,
} from "./retrievability";
export {
  weaknessScore,
  rankWeakness,
  type WeaknessCandidate,
  type WeaknessRow,
} from "./weakness";
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
  type CutoverMemory,
} from "./fsrs/fsrsCutover";
export {
  schedulerForPrefs,
  clearSchedulerCache,
  clampLearningStep,
  STUDY_LEARNING_STEPS,
  STUDY_RELEARNING_STEPS,
  type FsrsPrefs,
  type StudyScheduler,
} from "./fsrs/fsrsFactory";
export {
  FSRS_MIN_REVIEWS,
  FSRS_RETRAIN_DAYS,
  FSRS_CRON_MARK_LIMIT,
  FSRS_NEXT_DAY_STARTS_AT,
} from "./fsrs/fsrsOptimizeConstants";
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
  FSRS6_W_LENGTH,
  validateFsrsW,
  isLegacyFsrs6W,
  parseFsrsWJson,
} from "./fsrs/fsrsWeights";
