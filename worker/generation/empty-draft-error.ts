/** Client friendlyJobError matches this exact phrase when LO were set. */
export const EMPTY_DRAFTS_FOR_LEARNING_OBJECTIVES =
  "No flashcard drafts could be produced from this material for the given learning objectives.";

export function emptyDraftError(
  topicHints: readonly string[] | null | undefined,
  withoutHints: string,
): string {
  return topicHints?.length
    ? EMPTY_DRAFTS_FOR_LEARNING_OBJECTIVES
    : withoutHints;
}
