import { useCallback, useEffect, useLayoutEffect, useState } from "react";

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
  zen: boolean;
  exitZen: () => void;
  toggleZen: () => void;
};

/**
 * Tracks browser fullscreen for desktop zen. Shell chrome is owned by
 * useStudyImmersion via studyStage + setHideChrome (mobile immersion needs no FS).
 */
export function useStudyZenMode(): StudyZenMode {
  const [zen, setZen] = useState(documentIsFullscreen);

  useLayoutEffect(() => {
    setZen(documentIsFullscreen());
    return () => {
      exitStudyFullscreen();
    };
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setZen(documentIsFullscreen());
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const exitZen = useCallback(() => {
    setZen(false);
    exitStudyFullscreen();
  }, []);

  const toggleZen = useCallback(() => {
    if (documentIsFullscreen()) {
      exitStudyFullscreen();
      return;
    }
    void requestStudyFullscreen().catch(() => {
      setZen(false);
    });
  }, []);

  return {
    zen,
    toggleZen,
    exitZen,
  };
}
