export { default as CardFace } from "./faces/CardFace";
export { default as ClozePrompt } from "./faces/ClozePrompt";
export { default as ClozeReveal } from "./faces/ClozeReveal";
export { default as GradeButtons } from "./grading/GradeButtons";
export { default as ReviewCard } from "./faces/ReviewCard";
export { StudyNotesButton } from "./notes/StudyNotesButton";
export { default as StudyNotesDialog } from "./notes/StudyNotesDialog";
export { default as SubjectKnowledgeBar } from "./session/SubjectKnowledgeBar";
export {
  default as StrugglingList,
  formatStrugglingCaption,
} from "./session/StrugglingList";
export { default as KeyChip } from "./session/KeyChip";
export {
  FACE_SANS,
  FACE_SX,
  FACE_DISABLED_SX,
  CARD_COLUMN_SX,
  faceMotionSx,
  FACE_ANSWER_TEXT_SX,
  FACE_BODY_SX,
  FACE_FRONT_ECHO_SX,
  FACE_HINT_TEXT_SX,
  FACE_MEDIA_SX,
  FACE_PROMPT_TEXT_SX,
  PROMPT_SX,
} from "./faces/studyFaceSx";
export { useStudyCardGesture, applyStudySwipeFrame } from "./gestures/useStudyCardGesture";
export { useReviewSwipe, applyReviewSwipeFrame } from "./gestures/useReviewSwipe";
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
  CLOZE_BLANK_MAX,
  CLOZE_EXTRA_LABEL,
} from "./faces/clozeFormat";
export {
  MCQ_ANSWER_SEP,
  parseMcqAnswers,
  encodeMcqAnswers,
  mcqAnswersEqual,
  mcqSetRating,
  mcqTapRating,
  shuffledMcqOptions,
  mcqOptionButtonDisabled,
} from "./faces/mcqStudy";
export {
  getEmbedPdfEngine,
  openPdfDocument,
  listPdfPages,
  renderPageToCanvas,
  renderPageToCanvasAtScale,
  pageLayoutForNumber,
  pagePlainText,
  type EmbedPdfDocument,
  type EmbedPdfPageLayout,
} from "../materials/clientKernel";
export { FlipCardPlate, StudyCardPlate } from "./faces/CardFace";
export { CardFaceMcqBody } from "./faces/cardFaceMcq";
export {
  occlusionRevealAnswer,
  pickOcclusionRegion,
} from "./faces/pickOcclusionRegion";
export {
  StudyChromeProvider,
  useStudyChrome,
  type StudyChromeValue,
} from "./session/StudyChromeContext";
export { type EasyDay, localDayKey, applyLoadBalance } from "./queue/loadBalance";
export { useGradeMailboxFlight } from "./grading/useGradeMailboxFlight";
export { studyQueueProgress } from "./queue/studyQueueProgress";
export {
  isMcqCard,
  occlusionStudyParts,
  studyFrontText,
} from "./faces/studyCardPresentation";
export { useStudyNotesOverlay } from "./notes/useStudyNotesOverlay";
export { scopeLibraryBack } from "./scopeLibraryBack";
export { default as LearningSoftWait } from "./session/LearningSoftWait";
export { default as StudyFreshEmpty } from "./session/StudyFreshEmpty";
export { default as SessionComplete } from "./session/SessionComplete";
export { default as SessionQuietEnd } from "./session/SessionQuietEnd";
export { getIntroBonus } from "./queue/introBonus";
export { clientLocalDay } from "./localDay";
export {
  StudyCardActions,
  type StudyCardActionsHandle,
} from "./session/StudyCardActions";
export { useLearningRequeue } from "./queue/useLearningRequeue";
export { usePendingGradeSync } from "./grading/usePendingGradeSync";
export { useStudyImmersion } from "./session/useStudyImmersion";
export { useStudyGrade } from "./grading/useStudyGrade";
export { useStudyQueueLoad } from "./queue/useStudyQueueLoad";
export { useStudySessionKeys } from "./session/useStudySessionKeys";
export { default as TodayDueBreakdown } from "./session/TodayDueBreakdown";
export { pendingCardIdSet, type PendingGrade } from "./grading/pendingGrades";
export { warmDueMedia } from "./media/warmDueMedia";
export {
  maybeRunFsrsOptimize,
  runFsrsOptimizeTrainNow,
} from "./fsrs/fsrsOptimizeClient";
export { FSRS_MIN_REVIEWS } from "./fsrs/fsrsOptimizeConstants";
export {
  type StudyPrefs,
  DEFAULT_STUDY_PREFS,
} from "./queue/policyQueue";
export {
  MATURE_INTERVAL_DAYS,
  classifyKnowledgeBucket,
  aggregateSubjectKnowledge,
  composeSubjectKnowledge,
  type SubjectKnowledgeBuckets,
  type SubjectKnowledge,
} from "./session/subjectKnowledge";
export {
  dueCacheKey,
  dueScopeFromSearch,
  saveDueCache,
  loadDueCache,
  pruneDueCacheCard,
  filterDueExcludingPending,
  clearDueCache,
  type DueScopeOpts,
  type DueCacheSnapshot,
} from "./queue/dueCache";
export {
  dueSplitOk,
  aggregateDueByDeck,
  buildDueBreakdown,
  type DueDeckRow,
  type DueDeckRemainder,
  type DueBreakdown,
} from "./queue/dueBreakdown";
export type { ReviewDecision } from "./faces/ReviewCard";
export {
  emptyTally,
  gradedTotal,
  sessionSurface,
  type GradeTally,
} from "./session/sessionTally";