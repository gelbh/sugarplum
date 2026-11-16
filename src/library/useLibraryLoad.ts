import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ApiError,
  getJourney,
  listCovers,
  listDecks,
  listJobsWithDrafts,
  listMaterials,
  listSubjectCompositionSummaries,
  listSubjects,
  type Deck,
  type JobListItem,
  type MaterialListItem,
  type StoredCoverRow,
  type Subject,
  type SubjectCompositionSummary,
} from "../api/client";
import { deriveJourney } from "../journey/derive";
import { libraryShowsCreateFlow } from "./libraryCreateFlow";

type Args = {
  guest: boolean;
  endLoad: (ok?: boolean) => void;
  calendarRefresh: () => void | Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
};

export function useLibraryLoad({
  guest,
  endLoad,
  calendarRefresh,
  setError,
}: Args) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [draftJobs, setDraftJobs] = useState<JobListItem[]>([]);
  const [materials, setMaterials] = useState<MaterialListItem[]>([]);
  const [ready, setReady] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  /** Wizard opens only when the loaded library has no subjects. */
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const createFlowSeededRef = useRef(false);
  const [covers, setCovers] = useState<StoredCoverRow[]>([]);
  const [compositionBySubject, setCompositionBySubject] = useState<
    Record<string, Omit<SubjectCompositionSummary, "subjectId">>
  >({});

  const syncStepperFromJourney = useCallback(async () => {
    try {
      const derived = deriveJourney(await getJourney());
      setActiveStep(derived.next.action === "create_deck" ? 0 : 1);
    } catch {
      /* journey is optional for Library */
    }
  }, []);

  const refreshDraftJobs = useCallback(async () => {
    try {
      setDraftJobs(await listJobsWithDrafts());
    } catch {
      /* draft links are optional; subjects/stepper still work */
    }
  }, []);

  const refreshMaterials = useCallback(async () => {
    if (guest) {
      setMaterials([]);
      return;
    }
    try {
      setMaterials(await listMaterials());
    } catch {
      setMaterials([]);
    }
  }, [guest]);

  const refreshSubjects = useCallback(async () => {
    setSubjects(await listSubjects());
  }, []);

  const refreshDecks = useCallback(async () => {
    setDecks(await listDecks());
  }, []);

  const applyCompositionSummaries = useCallback(
    (summaries: SubjectCompositionSummary[]) => {
      setCompositionBySubject(
        Object.fromEntries(
          summaries.map(({ subjectId, ...rest }) => [subjectId, rest]),
        ),
      );
    },
    [],
  );

  const refreshCompositionSummaries = useCallback(async () => {
    try {
      applyCompositionSummaries(await listSubjectCompositionSummaries());
    } catch {
      applyCompositionSummaries([]);
    }
  }, [applyCompositionSummaries]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          subjectList,
          deckList,
          jobs,
          materialList,
          coverList,
          summaries,
        ] = await Promise.all([
          listSubjects(),
          listDecks(),
          listJobsWithDrafts().catch(() => [] as JobListItem[]),
          guest
            ? Promise.resolve([] as MaterialListItem[])
            : listMaterials().catch(() => [] as MaterialListItem[]),
          guest
            ? Promise.resolve([] as StoredCoverRow[])
            : listCovers().catch(() => [] as StoredCoverRow[]),
          listSubjectCompositionSummaries().catch(() => []),
        ]);
        if (cancelled) return;
        setSubjects(subjectList);
        setDecks(deckList);
        setDraftJobs(jobs);
        setMaterials(materialList);
        setCovers(coverList);
        applyCompositionSummaries(summaries);
        setReady(true);
        endLoad();
        void calendarRefresh();
        try {
          const derived = deriveJourney(await getJourney());
          if (cancelled) return;
          if (derived.next.action === "create_deck") {
            setActiveStep(0);
          } else if (deckList.length > 0) {
            setActiveStep(1);
          }
          if (!createFlowSeededRef.current) {
            createFlowSeededRef.current = true;
            setShowCreateFlow(libraryShowsCreateFlow(subjectList.length));
          }
        } catch {
          if (!cancelled && !createFlowSeededRef.current) {
            createFlowSeededRef.current = true;
            setShowCreateFlow(libraryShowsCreateFlow(subjectList.length));
          }
        }
      } catch (err) {
        if (cancelled) return;
        setShowCreateFlow(false);
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Failed to load library",
        );
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCompositionSummaries, calendarRefresh, endLoad, guest, setError]);

  return {
    subjects,
    setSubjects,
    decks,
    setDecks,
    draftJobs,
    materials,
    ready,
    activeStep,
    setActiveStep,
    showCreateFlow,
    setShowCreateFlow,
    covers,
    setCovers,
    compositionBySubject,
    syncStepperFromJourney,
    refreshDraftJobs,
    refreshMaterials,
    refreshSubjects,
    refreshDecks,
    refreshCompositionSummaries,
  };
}
