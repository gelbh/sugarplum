import { useEffect, useLayoutEffect } from "react";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { studyStage } from "./studyStage";
import { useStudyChrome } from "./StudyChromeContext";
import { useStudyZenMode } from "./useStudyZenMode";

/** Mobile card immersion + desktop Fullscreen zen; owns hideChrome sync. */
export function useStudyImmersion(hasCard: boolean): {
  stage: boolean;
  mobile: boolean;
  toggleZen: () => void;
  exitZen: () => void;
} {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const { zen: fullscreenZen, toggleZen, exitZen } = useStudyZenMode();
  const { setHideChrome } = useStudyChrome();
  const stage = studyStage({ mobile, hasCard, fullscreenZen });

  useLayoutEffect(() => {
    setHideChrome(stage);
    return () => setHideChrome(false);
  }, [stage, setHideChrome]);

  // Mobile immersion is card-scoped; drop FS so empty/complete restore chrome.
  useEffect(() => {
    if (mobile && !hasCard && fullscreenZen) exitZen();
  }, [mobile, hasCard, fullscreenZen, exitZen]);

  return { stage, mobile, toggleZen, exitZen };
}
