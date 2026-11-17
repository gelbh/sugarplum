import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ApiError,
  getJob,
  getJourney,
  listJobDrafts,
  type CardDraftView,
} from "../api/client";
import {
  emptyJobDraftCtas,
  type EmptyJobDraftCtas,
} from "../journey/emptyJobDraftCtas";
import type { StageCrumb } from "../library/StageBreadcrumbs";
import { friendlyJobError } from "./friendlyJobError";

type Args = {
  jobId: string | null;
  jobProgressReady: boolean;
  jobProgressError: string | null | undefined;
  beginLoad: () => void;
  endLoad: (ok?: boolean) => void;
  setDrafts: Dispatch<SetStateAction<CardDraftView[]>>;
  setEmptyCtas: Dispatch<SetStateAction<EmptyJobDraftCtas | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setJobStatus: Dispatch<SetStateAction<string | null>>;
  setCrumbs: Dispatch<SetStateAction<StageCrumb[]>>;
  setReady: Dispatch<SetStateAction<boolean>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
};

export function useDraftReviewLoad({
  jobId,
  jobProgressReady,
  jobProgressError,
  beginLoad,
  endLoad,
  setDrafts,
  setEmptyCtas,
  setError,
  setJobStatus,
  setCrumbs,
  setReady,
  setDirty,
}: Args) {
  const load = useCallback(
    async (id: string) => {
      const [list, job] = await Promise.all([listJobDrafts(id), getJob(id)]);
      setDrafts(list);
      setJobStatus(job.status);
      if (job.error) setError(friendlyJobError(job.error));
      setDirty(false);
      const next: StageCrumb[] = [{ label: "Library", href: "/library" }];
      if (job.subject_id && job.subject_title) {
        next.push({
          label: job.subject_title,
          href: `/library/subjects/${encodeURIComponent(job.subject_id)}`,
        });
      }
      if (job.deck_id && job.deck_title) {
        next.push({
          label: job.deck_title,
          href: `/library/decks/${encodeURIComponent(job.deck_id)}`,
        });
      }
      setCrumbs(next);
      return list;
    },
    [setCrumbs, setDirty, setDrafts, setError, setJobStatus],
  );

  const refreshJourney = useCallback(
    async (id: string, draftCount: number) => {
      try {
        if (draftCount > 0) {
          setEmptyCtas(null);
          return;
        }
        const journey = await getJourney();
        setEmptyCtas(
          emptyJobDraftCtas({
            jobId: id,
            openReviewJobId: journey.openReviewJobId,
            dueCount: journey.dueCount,
          }),
        );
      } catch {
        setEmptyCtas(null);
      }
    },
    [setEmptyCtas],
  );

  useEffect(() => {
    if (!jobId) {
      setError("Missing job id in URL");
      setReady(true);
    }
  }, [jobId, setError, setReady]);

  useEffect(() => {
    if (!jobId) return;
    // Failed jobs still need status + drafts so empty UI can offer Discard.
    if (!jobProgressReady && !jobProgressError) return;

    let cancelled = false;
    (async () => {
      beginLoad();
      try {
        const list = await load(jobId);
        if (cancelled) return;
        if (jobProgressError) setError(friendlyJobError(jobProgressError));
        await refreshJourney(jobId, list.length);
        if (cancelled) return;
        setReady(true);
        endLoad();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : (jobProgressError ?? "Failed to load drafts"),
        );
        if (jobProgressError) setJobStatus((prev) => prev ?? "failed");
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
      endLoad(false);
    };
  }, [
    beginLoad,
    endLoad,
    jobId,
    jobProgressError,
    jobProgressReady,
    load,
    refreshJourney,
    setError,
    setJobStatus,
    setReady,
  ]);

  return { load, refreshJourney };
}
