import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { AnatomyCanvasHandle } from "./AnatomyCanvas";
import type { StructureUiAction } from "./structureState";
import type { AnatomyClip, AnatomySceneManifest } from "./types";

type Args = {
  manifest: AnatomySceneManifest | null;
  canvasRef: RefObject<AnatomyCanvasHandle | null>;
  loadsKey: string;
  dispatch: Dispatch<StructureUiAction>;
  clipPaused: boolean;
  setActiveClipId: Dispatch<SetStateAction<string | null>>;
  setClipPaused: Dispatch<SetStateAction<boolean>>;
  setClipError: Dispatch<SetStateAction<string | null>>;
  setAutoRotate: Dispatch<SetStateAction<boolean>>;
  setSheetOpen: Dispatch<SetStateAction<boolean>>;
};

export function useAnatomyViewerClips({
  manifest,
  canvasRef,
  loadsKey,
  dispatch,
  clipPaused,
  setActiveClipId,
  setClipPaused,
  setClipError,
  setAutoRotate,
  setSheetOpen,
}: Args) {
  useEffect(() => {
    setActiveClipId(null);
    setClipPaused(false);
    setClipError(null);
  }, [loadsKey, setActiveClipId, setClipPaused, setClipError]);

  const selectClip = (clip: AnatomyClip, closeSheet: boolean) => {
    if (!manifest) return;
    const allIds = manifest.structures.map((s) => s.id);
    if (clip.reveal && clip.reveal.length > 0) {
      const keep = new Set(clip.reveal);
      dispatch({
        type: "hideAll",
        ids: allIds.filter((id) => !keep.has(id)),
      });
    }
    canvasRef.current?.stopClips();
    const ok = canvasRef.current?.playClip(clip.animation, {
      loop: clip.loop !== false,
    });
    if (!ok) {
      setClipError(`Animation "${clip.animation}" not found`);
      setActiveClipId(null);
      setClipPaused(false);
      return;
    }
    setClipError(null);
    setActiveClipId(clip.id);
    setClipPaused(false);
    setAutoRotate(false);
    if (closeSheet) setSheetOpen(false);
  };

  const togglePauseClip = () => {
    if (clipPaused) {
      canvasRef.current?.resumeClips();
      setClipPaused(false);
    } else {
      canvasRef.current?.pauseClips();
      setClipPaused(true);
    }
  };

  return { selectClip, togglePauseClip };
}
