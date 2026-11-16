import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  ApiError,
  commitStudyPacing,
  listDecks,
  listDueCards,
  listSubjects,
  type CardDraftView,
  type StudyQueueMeta,
} from "../api/client";
import {
  dueScopeFromSearch,
  filterDueExcludingPending,
  loadDueCache,
  saveDueCache,
  type DueScopeOpts,
} from "./dueCache";
import { bumpIntroBonus, getIntroBonus } from "./introBonus";
import { clientLocalDay } from "./localDay";
import { pendingCardIdSet } from "./pendingGrades";
import { cardIdFromSearch, prioritizeDueCard } from "./prioritizeDueCard";
import { warmDueMedia } from "./warmDueMedia";

type Args = {
  setRevealed: Dispatch<SetStateAction<boolean>>;
  beginStudyMore: () => void;
  endStudyMore: (ok?: boolean) => void;
  studyMoreBusy: boolean;
  userId: string | null;
};

export function useStudyQueueLoad({
  setRevealed,
  beginStudyMore,
  endStudyMore,
  studyMoreBusy,
  userId,
}: Args) {
  const [queue, setQueue] = useState<CardDraftView[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [deepLinkMiss, setDeepLinkMiss] = useState(false);
  const [scopeOpts] = useState<DueScopeOpts | undefined>(() =>
    dueScopeFromSearch(window.location.search),
  );
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  /** True once this mount showed at least one due card (scoped session-complete). */
  const [hadCards, setHadCards] = useState(false);
  const [queueMeta, setQueueMeta] = useState<StudyQueueMeta | null>(null);
  const queueRef = useRef<CardDraftView[]>([]);
  const introBonusRef = useRef<number | undefined>(undefined);
  if (introBonusRef.current === undefined) {
    introBonusRef.current = getIntroBonus();
  }

  const applyDueQueue = useCallback(
    (cards: CardDraftView[], wanted: string | null) => {
      const { queue: next, found } = prioritizeDueCard(cards, wanted);
      queueRef.current = next;
      setQueue(next);
      setQueueTotal(next.length);
      if (next.length > 0) setHadCards(true);
      // Only when there are other due cards to study (avoids contradicting empty session).
      setDeepLinkMiss(Boolean(wanted) && !found && next.length > 0);
      setRevealed(false);
    },
    [setRevealed],
  );

  const load = useCallback(
    async (uid: string, bonusOverride?: number) => {
      const wanted = cardIdFromSearch(window.location.search);
      const bonus = bonusOverride ?? introBonusRef.current ?? 0;
      const dueOpts = {
        ...scopeOpts,
        localDay: clientLocalDay(),
        ...(bonus > 0 ? { introBonus: bonus } : {}),
      };
      try {
        const {
          cards: due,
          meta,
          pendingDeferrals,
        } = await listDueCards(dueOpts);
        if ((pendingDeferrals?.length ?? 0) > 0) {
          try {
            await commitStudyPacing(dueOpts);
          } catch {
            /* peek queue still usable; dues stay until next commit */
          }
        }
        saveDueCache(uid, due, scopeOpts);
        warmDueMedia(due);
        applyDueQueue(due, wanted);
        setQueueMeta(meta);
        setOfflineCopy(false);
      } catch (err) {
        const cached = loadDueCache(uid, scopeOpts);
        if (cached && cached.cards.length > 0) {
          const filtered = filterDueExcludingPending(
            cached.cards,
            pendingCardIdSet(uid),
          );
          if (filtered.length === 0) throw err;
          applyDueQueue(filtered, wanted);
          setOfflineCopy(true);
          return;
        }
        throw err;
      }
    },
    [applyDueQueue, scopeOpts],
  );

  const onStudyMore = useCallback(async () => {
    if (!userId || studyMoreBusy || offlineCopy) return;
    setError(null);
    beginStudyMore();
    try {
      const next = bumpIntroBonus();
      introBonusRef.current = next;
      await load(userId, next);
      endStudyMore();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load more cards",
      );
      endStudyMore(false);
    }
  }, [
    beginStudyMore,
    endStudyMore,
    load,
    offlineCopy,
    studyMoreBusy,
    userId,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!scopeOpts) {
      setScopeLabel(null);
      return;
    }
    (async () => {
      try {
        if (scopeOpts.deckId) {
          const decks = await listDecks();
          if (cancelled) return;
          const deck = decks.find((d) => d.id === scopeOpts.deckId);
          setScopeLabel(deck?.title ?? "This deck");
          return;
        }
        if (scopeOpts.subjectId) {
          const subjects = await listSubjects();
          if (cancelled) return;
          const subject = subjects.find((s) => s.id === scopeOpts.subjectId);
          setScopeLabel(subject?.title ?? "This subject");
        }
      } catch {
        if (!cancelled) {
          setScopeLabel(scopeOpts.deckId ? "This deck" : "This subject");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeOpts]);

  return {
    queue,
    setQueue,
    queueTotal,
    setQueueTotal,
    ready,
    setReady,
    error,
    setError,
    offlineCopy,
    deepLinkMiss,
    setDeepLinkMiss,
    scopeOpts,
    scopeLabel,
    hadCards,
    setHadCards,
    queueMeta,
    queueRef: queueRef as MutableRefObject<CardDraftView[]>,
    introBonusRef,
    applyDueQueue,
    load,
    onStudyMore,
  };
}
