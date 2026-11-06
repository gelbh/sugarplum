import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useStudyChrome } from "./StudyChromeContext";

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

function documentIsFullscreen(): boolean {
  return document.fullscreenElement != null;
}

export type StudyZenMode = {
  /** True only while the document is fullscreen. */
  zen: boolean;
  /** Always false: a failed fullscreen request leaves zen off. */
  fullscreenUnavailable: boolean;
  clearFullscreenUnavailable: () => void;
  /** Leave zen, show shell chrome, and exit fullscreen. */
  exitZen: () => void;
  /** Enter fullscreen, or leave it when already fullscreen. */
  toggleZen: () => void;
  isZen: () => boolean;
};

/**
 * Zen matches browser fullscreen. Shell chrome stays visible until fullscreen
 * starts, and returns when fullscreen ends. The card stays mounted.
 */
export function useStudyZenMode(): StudyZenMode {
  const [zen, setZen] = useState(documentIsFullscreen);
  const { setHideChrome } = useStudyChrome();
  const zenRef = useRef(zen);

  const applyZen = useCallback(
    (on: boolean) => {
      zenRef.current = on;
      setZen(on);
      setHideChrome(on);
    },
    [setHideChrome],
  );

  useLayoutEffect(() => {
    applyZen(documentIsFullscreen());
    return () => {
      zenRef.current = false;
      setHideChrome(false);
      exitStudyFullscreen();
    };
  }, [applyZen, setHideChrome]);

  useEffect(() => {
    function onFullscreenChange() {
      applyZen(documentIsFullscreen());
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [applyZen]);

  const exitZen = useCallback(() => {
    applyZen(false);
    exitStudyFullscreen();
  }, [applyZen]);

  const toggleZen = useCallback(() => {
    if (documentIsFullscreen()) {
      exitStudyFullscreen();
      return;
    }
    void requestStudyFullscreen().catch(() => {
      applyZen(false);
    });
  }, [applyZen]);

  return {
    zen,
    fullscreenUnavailable: false,
    clearFullscreenUnavailable: () => {},
    toggleZen,
    exitZen,
    isZen: () => zenRef.current,
  };
}
