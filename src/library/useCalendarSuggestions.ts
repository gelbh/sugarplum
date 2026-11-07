import { useCallback, useState } from "react";
import {
  ApiError,
  createSubject,
  dismissCalendarCluster,
  getCalendarSuggestions,
  linkCalendarCluster,
  type CalendarSuggestion,
  type Subject,
} from "../api/client";

export function useCalendarSuggestions(
  guest: boolean,
  setSubjects: (updater: (prev: Subject[]) => Subject[]) => void,
  setError: (message: string | null) => void,
) {
  const [suggestions, setSuggestions] = useState<CalendarSuggestion[]>([]);
  const [deckChipsBySubjectId, setDeckChipsBySubjectId] = useState<
    Record<string, string[]>
  >({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (guest) {
      setSuggestions([]);
      setDeckChipsBySubjectId({});
      return;
    }
    try {
      const payload = await getCalendarSuggestions();
      setSuggestions(payload.subjects);
      setDeckChipsBySubjectId(payload.decksBySubjectId);
    } catch {
      setSuggestions([]);
      setDeckChipsBySubjectId({});
    }
  }, [guest]);

  const run = useCallback(
    (clusterKey: string, work: () => Promise<void>, failMessage: string) => {
      void (async () => {
        setBusyKey(clusterKey);
        setError(null);
        try {
          await work();
          await refresh();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : failMessage);
        } finally {
          setBusyKey(null);
        }
      })();
    },
    [refresh, setError],
  );

  const onAdd = useCallback(
    (suggestion: CalendarSuggestion) => {
      run(
        suggestion.clusterKey,
        async () => {
          const created = await createSubject(suggestion.title);
          setSubjects((prev) => [...prev, created]);
          await linkCalendarCluster(suggestion.clusterKey, created.id);
        },
        "Could not apply calendar suggestion",
      );
    },
    [run, setSubjects],
  );

  const onLink = useCallback(
    (suggestion: CalendarSuggestion, subjectId: string) => {
      run(
        suggestion.clusterKey,
        async () => {
          await linkCalendarCluster(suggestion.clusterKey, subjectId);
        },
        "Could not apply calendar suggestion",
      );
    },
    [run],
  );

  const onDismiss = useCallback(
    (suggestion: CalendarSuggestion) => {
      run(
        suggestion.clusterKey,
        async () => {
          await dismissCalendarCluster(suggestion.clusterKey);
        },
        "Could not dismiss suggestion",
      );
    },
    [run],
  );

  return {
    suggestions,
    deckChipsBySubjectId,
    busyKey,
    refresh,
    onAdd,
    onLink,
    onDismiss,
  };
}
