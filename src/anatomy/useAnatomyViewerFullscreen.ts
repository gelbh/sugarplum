import {
  useEffect,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

type Args = {
  stageRef: RefObject<HTMLDivElement | null>;
  setSheetOpen: Dispatch<SetStateAction<boolean>>;
  setMoreAnchor: Dispatch<SetStateAction<HTMLElement | null>>;
};

export function useAnatomyViewerFullscreen({
  stageRef,
  setSheetOpen,
  setMoreAnchor,
}: Args) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onFs = () => {
      const onStage = document.fullscreenElement === stageRef.current;
      setFullscreen(onStage);
      if (onStage) {
        setSheetOpen(false);
        setMoreAnchor(null);
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [stageRef, setSheetOpen, setMoreAnchor]);

  const toggleFullscreen = async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* ignore fullscreen rejection */
    }
  };

  return { fullscreen, toggleFullscreen };
}
