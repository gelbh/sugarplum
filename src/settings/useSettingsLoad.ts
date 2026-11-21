import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  ApiError,
  getCalendarStatus,
  getGamification,
  getLlmSettings,
  getStudyPrefs,
  listDueCards,
  type CalendarStatus,
  type GamificationResponse,
  type LlmSettings,
  type StudyPrefs,
} from "../api/client";
import { isGuest } from "../guest/session";
import type { EasyDay } from "../study/loadBalance";

type SessionUser = {
  email: string;
  google_linked?: boolean;
};

type Args = {
  user: SessionUser | null;
  endLoad: (ok?: boolean) => void;
  setGuest: Dispatch<SetStateAction<boolean>>;
  setAccountEmail: Dispatch<SetStateAction<string | null>>;
  setGoogleLinked: Dispatch<SetStateAction<boolean>>;
  setCalendarStatus: Dispatch<SetStateAction<CalendarStatus | null>>;
  setCurrent: Dispatch<SetStateAction<LlmSettings | null>>;
  setProvider: Dispatch<SetStateAction<string>>;
  setZaiModel: Dispatch<SetStateAction<string>>;
  setStudyPrefs: Dispatch<SetStateAction<StudyPrefs>>;
  setIntroBudgetInput: Dispatch<SetStateAction<string>>;
  setReviewBudgetInput: Dispatch<SetStateAction<string>>;
  setDesiredRetentionInput: Dispatch<SetStateAction<string>>;
  setEnableFuzz: Dispatch<SetStateAction<boolean>>;
  setEnableLoadBalance: Dispatch<SetStateAction<boolean>>;
  setEasyDays: Dispatch<SetStateAction<EasyDay[]>>;
  setGamification: Dispatch<SetStateAction<GamificationResponse | null>>;
  setDisplayNameInput: Dispatch<SetStateAction<string>>;
  setBoardOptIn: Dispatch<SetStateAction<boolean>>;
  setDailyGoalInput: Dispatch<SetStateAction<string>>;
  setHeldIntroCount: Dispatch<SetStateAction<number | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setReady: Dispatch<SetStateAction<boolean>>;
};

export function useSettingsLoad({
  user,
  endLoad,
  setGuest,
  setAccountEmail,
  setGoogleLinked,
  setCalendarStatus,
  setCurrent,
  setProvider,
  setZaiModel,
  setStudyPrefs,
  setIntroBudgetInput,
  setReviewBudgetInput,
  setDesiredRetentionInput,
  setEnableFuzz,
  setEnableLoadBalance,
  setEasyDays,
  setGamification,
  setDisplayNameInput,
  setBoardOptIn,
  setDailyGoalInput,
  setHeldIntroCount,
  setError,
  setReady,
}: Args) {
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const guestMode = isGuest();
        const settings = await getLlmSettings();
        const prefs = await getStudyPrefs();
        const gam = guestMode
          ? null
          : await getGamification().catch(() => null);
        const calendar = guestMode
          ? null
          : await getCalendarStatus().catch(() => null);
        if (cancelled) return;
        setGuest(guestMode);
        setAccountEmail(user.email);
        setGoogleLinked(user.google_linked === true);
        setCalendarStatus(calendar);
        setCurrent(settings);
        if (settings.configured) {
          setProvider(settings.provider);
          if (settings.provider === "zai" && settings.model) {
            setZaiModel(settings.model);
          }
        }
        setStudyPrefs(prefs);
        setIntroBudgetInput(String(prefs.introBudget));
        setReviewBudgetInput(String(prefs.reviewBudget));
        setDesiredRetentionInput(String(prefs.desiredRetention));
        setEnableFuzz(prefs.enableFuzz);
        setEnableLoadBalance(prefs.enableLoadBalance);
        setEasyDays([...prefs.easyDays]);
        if (gam) {
          setGamification(gam);
          setDisplayNameInput(gam.displayName ?? "");
          setBoardOptIn(gam.boardOptIn);
          setDailyGoalInput(String(gam.dailyGoalReviews));
        }
        setReady(true);
        endLoad();
        // Waiting count is informative; don't block Settings paint on the due queue.
        void listDueCards()
          .then((due) => {
            if (cancelled) return;
            if (typeof due.meta?.heldIntroCount === "number") {
              setHeldIntroCount(due.meta.heldIntroCount);
            }
          })
          .catch(() => {});
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Failed to load settings",
        );
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    endLoad,
    setAccountEmail,
    setBoardOptIn,
    setDailyGoalInput,
    setCalendarStatus,
    setCurrent,
    setDesiredRetentionInput,
    setDisplayNameInput,
    setEasyDays,
    setEnableFuzz,
    setEnableLoadBalance,
    setError,
    setGamification,
    setGoogleLinked,
    setGuest,
    setHeldIntroCount,
    setIntroBudgetInput,
    setProvider,
    setReady,
    setReviewBudgetInput,
    setStudyPrefs,
    setZaiModel,
    user,
  ]);
}
