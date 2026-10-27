import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStudyChrome } from "./StudyChromeContext";
import { loadZenPreference, saveZenPreference } from "./zenPreference";

function requestStudyFullscreen(): Promise<void> {
  const el = document.documentElement;
  if (typeof el.requestFullscreen !== "function") {
    return Promise.reject(new Error("Fullscreen API unavailable"));
  }
  return el.requestFullscreen();
}

function exitStudyFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen?.();
  }
}

export type StudyZenMode = {
  zen: boolean;
  fullscreenUnavailable: boolean;
  clearFullscreenUnavailable: () => void;
  toggleZen: () => void;
  exitZen: () => void;
  ensureFullscreenIfNeeded: () => void;
  /** For key handlers that must not close over stale zen. */
  isZen: () => boolean;
};

/** Owns zen preference, chrome strip, fullscreen, and Esc-without-FS sync. */
export function useStudyZenMode(): StudyZenMode {
  const [zen, setZen] = useState(() => loadZenPreference());
  const [needsFullscreenPrompt, setNeedsFullscreenPrompt] = useState(
    () => loadZenPreference(),
  );
  const [fullscreenUnavailable, setFullscreenUnavailable] = useState(false);
  const { setHideChrome } = useStudyChrome();
  const zenRef = useRef(zen);

  useEffect(() => {
    zenRef.current = zen;
  }, [zen]);

  useLayoutEffect(() => {
    setHideChrome(loadZenPreference());
    return () => {
      setHideChrome(false);
      exitStudyFullscreen();
    };
  }, [setHideChrome]);

  useEffect(() => {
    function onFullscreenChange() {
      if (document.fullscreenElement) return;
      if (!zenRef.current) return;
      zenRef.current = false;
      setZen(false);
      setHideChrome(false);
      saveZenPreference(false);
      setNeedsFullscreenPrompt(false);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [setHideChrome]);

  const enterZen = useCallback(async () => {
    saveZenPreference(true);
    setZen(true);
    zenRef.current = true;
    setHideChrome(true);
    setNeedsFullscreenPrompt(false);
    try {
      await requestStudyFullscreen();
    } catch {
      setFullscreenUnavailable(true);
    }
  }, [setHideChrome]);

  const exitZen = useCallback(() => {
    saveZenPreference(false);
    setZen(false);
    zenRef.current = false;
    setHideChrome(false);
    setNeedsFullscreenPrompt(false);
    exitStudyFullscreen();
  }, [setHideChrome]);

  const toggleZen = useCallback(() => {
    if (zenRef.current) {
      exitZen();
      return;
    }
    void enterZen();
  }, [enterZen, exitZen]);

  const ensureFullscreenIfNeeded = useCallback(() => {
    if (!needsFullscreenPrompt || !zenRef.current || document.fullscreenElement) {
      return;
    }
    setNeedsFullscreenPrompt(false);
    void requestStudyFullscreen().catch(() => {
      setFullscreenUnavailable(true);
    });
  }, [needsFullscreenPrompt]);

  return {
    zen,
    fullscreenUnavailable,
    clearFullscreenUnavailable: () => setFullscreenUnavailable(false),
    toggleZen,
    exitZen,
    ensureFullscreenIfNeeded,
    isZen: () => zenRef.current,
  };
}
