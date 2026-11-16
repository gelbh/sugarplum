import { useCallback, type Dispatch, type FormEvent, type SetStateAction } from "react";
import {
  ApiError,
  listDueCards,
  putStudyPrefs,
  type StudyPrefs,
} from "../api/client";
import type { EasyDay } from "../study/loadBalance";

type Args = {
  introBudgetInput: string;
  reviewBudgetInput: string;
  desiredRetentionInput: string;
  studyPrefs: StudyPrefs;
  enableFuzz: boolean;
  enableLoadBalance: boolean;
  easyDays: EasyDay[];
  beginStudy: () => void;
  endStudy: (ok?: boolean) => void;
  setStudyError: Dispatch<SetStateAction<string | null>>;
  setStudyNotice: Dispatch<SetStateAction<string | null>>;
  setStudyPrefs: Dispatch<SetStateAction<StudyPrefs>>;
  setIntroBudgetInput: Dispatch<SetStateAction<string>>;
  setReviewBudgetInput: Dispatch<SetStateAction<string>>;
  setDesiredRetentionInput: Dispatch<SetStateAction<string>>;
  setEnableFuzz: Dispatch<SetStateAction<boolean>>;
  setEnableLoadBalance: Dispatch<SetStateAction<boolean>>;
  setEasyDays: Dispatch<SetStateAction<EasyDay[]>>;
  setHeldIntroCount: Dispatch<SetStateAction<number | null>>;
};

export function useSettingsStudyForm({
  introBudgetInput,
  reviewBudgetInput,
  desiredRetentionInput,
  studyPrefs,
  enableFuzz,
  enableLoadBalance,
  easyDays,
  beginStudy,
  endStudy,
  setStudyError,
  setStudyNotice,
  setStudyPrefs,
  setIntroBudgetInput,
  setReviewBudgetInput,
  setDesiredRetentionInput,
  setEnableFuzz,
  setEnableLoadBalance,
  setEasyDays,
  setHeldIntroCount,
}: Args) {
  const onSubmitStudy = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setStudyError(null);
      setStudyNotice(null);
      const introBudget = Number(introBudgetInput);
      const reviewBudget = Number(reviewBudgetInput);
      const desiredRetention = Number(desiredRetentionInput);
      if (
        !Number.isFinite(introBudget) ||
        !Number.isFinite(reviewBudget) ||
        !Number.isFinite(desiredRetention) ||
        desiredRetention < 0.7 ||
        desiredRetention > 0.97 ||
        introBudget < 1 ||
        reviewBudget < 1
      ) {
        setStudyError(
          "Enter positive budgets and a retention between 0.70 and 0.97.",
        );
        return;
      }
      beginStudy();
      try {
        const saved = await putStudyPrefs({
          introBudget,
          reviewBudget,
          rFloor: studyPrefs.rFloor,
          desiredRetention,
          enableFuzz,
          enableLoadBalance,
          easyDays,
        });
        setStudyPrefs(saved);
        setIntroBudgetInput(String(saved.introBudget));
        setReviewBudgetInput(String(saved.reviewBudget));
        setDesiredRetentionInput(String(saved.desiredRetention));
        setEnableFuzz(saved.enableFuzz);
        setEnableLoadBalance(saved.enableLoadBalance);
        setEasyDays([...saved.easyDays]);
        setStudyNotice("Study settings saved.");
        endStudy();
        void listDueCards()
          .then((due) => {
            if (typeof due.meta?.heldIntroCount === "number") {
              setHeldIntroCount(due.meta.heldIntroCount);
            }
          })
          .catch(() => {});
      } catch (err) {
        setStudyError(
          err instanceof ApiError ? err.message : "Could not save study prefs",
        );
        endStudy(false);
      }
    },
    [
      beginStudy,
      desiredRetentionInput,
      easyDays,
      enableFuzz,
      enableLoadBalance,
      endStudy,
      introBudgetInput,
      reviewBudgetInput,
      setDesiredRetentionInput,
      setEasyDays,
      setEnableFuzz,
      setEnableLoadBalance,
      setHeldIntroCount,
      setIntroBudgetInput,
      setReviewBudgetInput,
      setStudyError,
      setStudyNotice,
      setStudyPrefs,
      studyPrefs.rFloor,
    ],
  );

  return { onSubmitStudy };
}
