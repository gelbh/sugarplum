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
  beginAchieve: () => void;
  endAchieve: (ok?: boolean) => void;
  setAchieveError: Dispatch<SetStateAction<string | null>>;
  setAchieveNotice: Dispatch<SetStateAction<string | null>>;
  setGamification: Dispatch<SetStateAction<GamificationResponse | null>>;
  setDisplayNameInput: Dispatch<SetStateAction<string>>;
  setBoardOptIn: Dispatch<SetStateAction<boolean>>;
};

export function useSettingsAchievementsForm({
  guest,
  boardOptIn,
  displayNameInput,
  beginAchieve,
  endAchieve,
  setAchieveError,
  setAchieveNotice,
  setGamification,
  setDisplayNameInput,
  setBoardOptIn,
}: Args) {
  const onSubmitAchievements = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (guest) return;
      setAchieveError(null);
      setAchieveNotice(null);
      beginAchieve();
      try {
        const saved = await patchGamificationSettings({
          boardOptIn,
          displayName: displayNameInput.trim() || null,
        });
        setGamification(saved);
        setDisplayNameInput(saved.displayName ?? "");
        setBoardOptIn(saved.boardOptIn);
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
      displayNameInput,
      endAchieve,
      guest,
      setAchieveError,
      setAchieveNotice,
      setBoardOptIn,
      setDisplayNameInput,
      setGamification,
    ],
  );

  return { onSubmitAchievements };
}
