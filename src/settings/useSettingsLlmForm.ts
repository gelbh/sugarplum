import { useCallback, type Dispatch, type FormEvent, type SetStateAction } from "react";
import {
  ApiError,
  deleteLlmSettings,
  putLlmSettings,
  type LlmSettings,
} from "../api/client";

type Args = {
  provider: string;
  apiKey: string;
  zaiModel: string;
  begin: () => void;
  end: (ok?: boolean) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setCurrent: Dispatch<SetStateAction<LlmSettings | null>>;
  setApiKey: Dispatch<SetStateAction<string>>;
};

export function useSettingsLlmForm({
  provider,
  apiKey,
  zaiModel,
  begin,
  end,
  setError,
  setNotice,
  setCurrent,
  setApiKey,
}: Args) {
  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setNotice(null);
      begin();
      try {
        const saved = await putLlmSettings(
          provider,
          apiKey,
          provider === "zai" ? zaiModel : undefined,
        );
        setCurrent(saved);
        setApiKey("");
        setNotice("API key saved (encrypted at rest).");
        end();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not save key");
        end(false);
      }
    },
    [
      apiKey,
      begin,
      end,
      provider,
      setApiKey,
      setCurrent,
      setError,
      setNotice,
      zaiModel,
    ],
  );

  const onRemoveKey = useCallback(async () => {
    if (
      !window.confirm(
        "Remove the saved API key? New generation will use free platform AI.",
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await deleteLlmSettings();
      setCurrent({ configured: false });
      setApiKey("");
      setNotice("API key removed. Generation will use free platform AI.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove key");
    }
  }, [setApiKey, setCurrent, setError, setNotice]);

  return { onSubmit, onRemoveKey };
}
