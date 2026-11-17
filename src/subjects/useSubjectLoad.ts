import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ApiError,
  listCovers,
  listDecks,
  listJobsWithDrafts,
  listSubjects,
  subjectComposition,
  type Deck,
  type JobListItem,
  type StoredCoverRow,
  type Subject,
  type SubjectKnowledge,
} from "../api/client";

type Args = {
  subjectId: string;
  guest: boolean;
  endLoad: (ok?: boolean) => void;
  setSubject: Dispatch<SetStateAction<Subject | null>>;
  setDecks: Dispatch<SetStateAction<Deck[]>>;
  setCovers: Dispatch<SetStateAction<StoredCoverRow[]>>;
  setKnowledge: Dispatch<SetStateAction<SubjectKnowledge | null>>;
  setDraftJobs: Dispatch<SetStateAction<JobListItem[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setReady: Dispatch<SetStateAction<boolean>>;
};

export function useSubjectLoad({
  subjectId,
  guest,
  endLoad,
  setSubject,
  setDecks,
  setCovers,
  setKnowledge,
  setDraftJobs,
  setError,
  setReady,
}: Args) {
  const load = useCallback(async () => {
    const [subjects, deckList, coverList, knowledgeResult, jobs] =
      await Promise.all([
        listSubjects(),
        listDecks(subjectId),
        guest
          ? Promise.resolve([] as StoredCoverRow[])
          : listCovers().catch(() => [] as StoredCoverRow[]),
        subjectComposition(subjectId).catch(() => null),
        guest
          ? Promise.resolve([] as JobListItem[])
          : listJobsWithDrafts().catch(() => [] as JobListItem[]),
      ]);
    const found = subjects.find((s) => s.id === subjectId) ?? null;
    setSubject(found);
    setDecks(deckList);
    setCovers(coverList);
    setKnowledge(knowledgeResult);
    setDraftJobs(jobs);
    return found;
  }, [
    guest,
    setCovers,
    setDecks,
    setDraftJobs,
    setKnowledge,
    setSubject,
    subjectId,
  ]);

  const syncSubjectFromList = useCallback(async () => {
    const subjects = await listSubjects();
    const found = subjects.find((s) => s.id === subjectId) ?? null;
    setSubject(found);
    return found;
  }, [setSubject, subjectId]);

  const refreshKnowledge = useCallback(async () => {
    try {
      setKnowledge(await subjectComposition(subjectId));
    } catch {
      // Soft-fail: keep prior bar rather than blanking the page.
    }
  }, [setKnowledge, subjectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await load();
        if (cancelled) return;
        if (!found) {
          setError("Subject not found");
        }
        setReady(true);
        endLoad();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Failed to load subject",
        );
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad, load, setError, setReady]);

  return { load, syncSubjectFromList, refreshKnowledge };
}
