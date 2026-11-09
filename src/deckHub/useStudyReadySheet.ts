import { useState } from "react";
import { ApiError, listDueCards } from "../api/client";
import type { StudyReadySummary } from "./StudyReadySheet";

export function useStudyReadySheet() {
  const [studySummary, setStudySummary] = useState<StudyReadySummary | null>(
    null,
  );
  const [studySummaryLoading, setStudySummaryLoading] = useState(false);
  const [studySummaryError, setStudySummaryError] = useState<string | null>(
    null,
  );

  function loadStudySummary(deckId: string, acceptedCount: number) {
    setStudySummaryLoading(true);
    setStudySummary(null);
    setStudySummaryError(null);
    void listDueCards({ deckId })
      .then((result) => {
        setStudySummary({
          due: result.cards.length,
          accepted: acceptedCount,
          introRemaining: result.meta.introRemaining,
        });
      })
      .catch((err) => {
        setStudySummary(null);
        setStudySummaryError(
          err instanceof ApiError
            ? err.message
            : "Could not load study counts",
        );
      })
      .finally(() => setStudySummaryLoading(false));
  }

  return {
    studySummary,
    studySummaryLoading,
    studySummaryError,
    loadStudySummary,
  };
}
