import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ApiError,
  getDeckComposition,
  listDeckCards,
  listDeckMaterials,
  listDecks,
  listJobsWithDrafts,
  listSubjects,
  type CardDraftView,
  type Deck,
  type JobListItem,
  type MaterialListItem,
  type Subject,
  type SubjectKnowledge,
} from "../api/client";

type Args = {
  deckId: string;
  guest: boolean;
  showArchived: boolean;
  ready: boolean;
  deck: Deck | null;
  endLoad: (ok?: boolean) => void;
  refreshDeckCover: () => Promise<void>;
  setDeck: Dispatch<SetStateAction<Deck | null>>;
  setSubject: Dispatch<SetStateAction<Subject | null>>;
  setCards: Dispatch<SetStateAction<CardDraftView[]>>;
  setAcceptedCount: Dispatch<SetStateAction<number>>;
  setComposition: Dispatch<SetStateAction<SubjectKnowledge | null>>;
  setDraftJobs: Dispatch<SetStateAction<JobListItem[]>>;
  setMaterials: Dispatch<SetStateAction<MaterialListItem[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setReady: Dispatch<SetStateAction<boolean>>;
};

export function useDeckHubLoad({
  deckId,
  guest,
  showArchived,
  ready,
  deck,
  endLoad,
  refreshDeckCover,
  setDeck,
  setSubject,
  setCards,
  setAcceptedCount,
  setComposition,
  setDraftJobs,
  setMaterials,
  setError,
  setReady,
}: Args) {
  const refreshComposition = useCallback(async () => {
    try {
      setComposition(await getDeckComposition(deckId));
    } catch {
      setComposition(null);
    }
  }, [deckId, setComposition]);

  const refreshCards = useCallback(async () => {
    const next = await listDeckCards(
      deckId,
      showArchived ? { status: "archived" } : undefined,
    );
    setCards(next);
    if (!showArchived) {
      setAcceptedCount(next.length);
    } else {
      const accepted = await listDeckCards(deckId);
      setAcceptedCount(accepted.length);
    }
    await refreshComposition();
  }, [
    deckId,
    refreshComposition,
    setAcceptedCount,
    setCards,
    showArchived,
  ]);

  const refreshDraftJobs = useCallback(async () => {
    if (guest) {
      setDraftJobs([]);
      return;
    }
    try {
      const jobs = await listJobsWithDrafts();
      setDraftJobs(jobs.filter((j) => j.deck_id === deckId));
    } catch {
      setDraftJobs([]);
    }
  }, [deckId, guest, setDraftJobs]);

  const refreshMaterials = useCallback(async () => {
    if (guest) {
      setMaterials([]);
      return;
    }
    try {
      setMaterials(await listDeckMaterials(deckId));
    } catch {
      setMaterials([]);
    }
  }, [deckId, guest, setMaterials]);

  const load = useCallback(async () => {
    const [deckList, subjects] = await Promise.all([
      listDecks(),
      listSubjects(),
    ]);
    const found = deckList.find((d) => d.id === deckId) ?? null;
    setDeck(found);
    setSubject(
      found ? (subjects.find((s) => s.id === found.subject_id) ?? null) : null,
    );
    if (found) {
      await Promise.all([
        refreshDraftJobs(),
        refreshMaterials(),
        refreshDeckCover(),
        refreshComposition(),
      ]);
    } else {
      setComposition(null);
    }
    return found;
  }, [
    deckId,
    refreshComposition,
    refreshDeckCover,
    refreshDraftJobs,
    refreshMaterials,
    setComposition,
    setDeck,
    setSubject,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await load();
        if (cancelled) return;
        if (!found) setError("Deck not found");
        setReady(true);
        endLoad();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load deck");
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad, load, setError, setReady]);

  useEffect(() => {
    if (!ready || !deck) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await listDeckCards(
          deckId,
          showArchived ? { status: "archived" } : undefined,
        );
        if (cancelled) return;
        setCards(next);
        if (!showArchived) {
          setAcceptedCount(next.length);
        } else {
          try {
            const accepted = await listDeckCards(deckId);
            if (!cancelled) setAcceptedCount(accepted.length);
          } catch {
            if (!cancelled) setAcceptedCount(0);
          }
        }
        try {
          const nextComposition = await getDeckComposition(deckId);
          if (!cancelled) setComposition(nextComposition);
        } catch {
          if (!cancelled) setComposition(null);
        }
      } catch {
        if (!cancelled) setCards([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    deck,
    deckId,
    ready,
    setAcceptedCount,
    setCards,
    setComposition,
    showArchived,
  ]);

  return {
    load,
    refreshComposition,
    refreshCards,
    refreshDraftJobs,
    refreshMaterials,
  };
}
