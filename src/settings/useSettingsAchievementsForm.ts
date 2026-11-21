import { useCallback, type Dispatch, type FormEvent, type SetStateAction } from "react";
import {
  ApiError,
  patchGamificationSettings,
  type GamificationResponse,
} from "../api/client";

type Args = {
  guest: boolean;
  boardOptIn: boolean;
  displayNameInput: string;
  dailyGoalInput: string;
  beginAchieve: () => void;
  endAchieve: (ok?: boolean) => void;
  setAchieveError: Dispatch<SetStateAction<string | null>>;
  setAchieveNotice: Dispatch<SetStateAction<string | null>>;
  setGamification: Dispatch<SetStateAction<GamificationResponse | null>>;
  setDisplayNameInput: Dispatch<SetStateAction<string>>;
  setBoardOptIn: Dispatch<SetStateAction<boolean>>;
  setDailyGoalInput: Dispatch<SetStateAction<string>>;
};

export function useSettingsAchievementsForm({
  guest,
  boardOptIn,
  displayNameInput,
  dailyGoalInput,
  beginAchieve,
  endAchieve,
  setAchieveError,
  setAchieveNotice,
  setGamification,
  setDisplayNameInput,
  setBoardOptIn,
  setDailyGoalInput,
}: Args) {
  const onSubmitAchievements = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (guest) return;
      setAchieveError(null);
      setAchieveNotice(null);
      beginAchieve();
      try {
        const parsed = Number(dailyGoalInput);
        if (!Number.isFinite(parsed)) {
          setAchieveError("Daily goal must be a number between 5 and 100.");
          endAchieve(false);
          return;
        }
        const saved = await patchGamificationSettings({
          boardOptIn,
          displayName: displayNameInput.trim() || null,
          dailyGoalReviews: parsed,
        });
        setGamification(saved);
        setDisplayNameInput(saved.displayName ?? "");
        setBoardOptIn(saved.boardOptIn);
        setDailyGoalInput(String(saved.dailyGoalReviews));
        setAchieveNotice("Achievement settings saved.");
        endAchieve();
      } catch (err) {
        setAchieveError(
          err instanceof ApiError ? err.message : "Could not save settings",
        );
        endAchieve(false);
      }
    },
    [
      beginAchieve,
      boardOptIn,
      dailyGoalInput,
      displayNameInput,
      endAchieve,
      guest,
      setAchieveError,
      setAchieveNotice,
      setBoardOptIn,
      setDailyGoalInput,
      setDisplayNameInput,
      setGamification,
    ],
  );

  return { onSubmitAchievements };
}
