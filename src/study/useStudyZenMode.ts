import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useStudyChrome } from "./StudyChromeContext";
import { saveZenPreference } from "./zenPreference";

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
  /** Always true while Study owns the session (zen-first). */
  zen: boolean;
  /** Always false: FS failure is soft and silent. */
  fullscreenUnavailable: boolean;
  clearFullscreenUnavailable: () => void;
  /** Tear down chrome strip before leaving Study. */
  exitZen: () => void;
  /** Soft-request or exit browser fullscreen. */
  toggleZen: () => void;
  ensureFullscreenIfNeeded: () => void;
  isZen: () => boolean;
};

/**
 * Zen-first study session: hide shell chrome for the mount, optional soft
 * fullscreen. Leaving FS does not restore desk chrome.
 */
export function useStudyZenMode(): StudyZenMode {
  const [zen, setZen] = useState(true);
  const [needsFullscreenPrompt, setNeedsFullscreenPrompt] = useState(true);
  const { setHideChrome } = useStudyChrome();
  const zenRef = useRef(true);

  useLayoutEffect(() => {
    setZen(true);
    zenRef.current = true;
    setHideChrome(true);
    saveZenPreference(true);
    return () => {
      setHideChrome(false);
      exitStudyFullscreen();
    };
  }, [setHideChrome]);

  useEffect(() => {
    function onFullscreenChange() {
      if (document.fullscreenElement) {
        setNeedsFullscreenPrompt(false);
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const softRequestFullscreen = useCallback(() => {
    void requestStudyFullscreen().catch(() => {
      /* soft-fail: chrome strip still works without FS */
    });
  }, []);

  const exitZen = useCallback(() => {
    setZen(false);
    zenRef.current = false;
    setHideChrome(false);
    setNeedsFullscreenPrompt(false);
    exitStudyFullscreen();
  }, [setHideChrome]);

  const toggleZen = useCallback(() => {
    if (document.fullscreenElement) {
      exitStudyFullscreen();
      return;
    }
    softRequestFullscreen();
  }, [softRequestFullscreen]);

  const ensureFullscreenIfNeeded = useCallback(() => {
    if (
      !needsFullscreenPrompt ||
      !zenRef.current ||
      document.fullscreenElement
    ) {
      return;
    }
    setNeedsFullscreenPrompt(false);
    softRequestFullscreen();
  }, [needsFullscreenPrompt, softRequestFullscreen]);

  return {
    zen,
    fullscreenUnavailable: false,
    clearFullscreenUnavailable: () => {},
    toggleZen,
    exitZen,
    ensureFullscreenIfNeeded,
    isZen: () => zenRef.current,
  };
}
