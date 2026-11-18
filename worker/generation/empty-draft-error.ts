/** Stable worker error when generation yields zero drafts and the job had LO. */
export const EMPTY_DRAFTS_FOR_LEARNING_OBJECTIVES =
  "No flashcard drafts could be produced from this material for the given learning objectives.";

/** Pick empty-draft error: LO marker when hints present, else the site-specific base. */
export function emptyDraftError(
  topicHints: readonly string[] | null | undefined,
  withoutHints: string,
): string {
  return topicHints?.length
    ? EMPTY_DRAFTS_FOR_LEARNING_OBJECTIVES
    : withoutHints;
}
