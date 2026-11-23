import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { AnatomyCameraMode } from "./AnatomyCanvas";
import type { AnatomySheetTab } from "./AnatomyMobileSheet";
import type { BgChoiceId } from "./anatomyViewerBg";
import {
  activeRegionIdsForOpen,
  parseAnatomySceneManifest,
} from "./parseScene";
import type { StructureUiAction } from "../structure/structureState";
import type { AnatomyStudyMode } from "../anatomyStudyMode";
import type { AnatomySceneManifest } from "../types";

type Args = {
  sceneId: string;
  initialRegions: string[];
  dispatch: Dispatch<StructureUiAction>;
  setAutoRotate: Dispatch<SetStateAction<boolean>>;
  setWireframe: Dispatch<SetStateAction<boolean>>;
  setFadeOthers: Dispatch<SetStateAction<boolean>>;
  setAutoFocus: Dispatch<SetStateAction<boolean>>;
  setCameraMode: Dispatch<SetStateAction<AnatomyCameraMode>>;
  setHelpOpen: Dispatch<SetStateAction<boolean>>;
  setBgId: Dispatch<SetStateAction<BgChoiceId>>;
  setStudyMode: Dispatch<SetStateAction<AnatomyStudyMode>>;
  setRevealedIds: Dispatch<SetStateAction<Set<string>>>;
  setMakeCardsOpen: Dispatch<SetStateAction<boolean>>;
  setMakeCardsNotice: Dispatch<SetStateAction<string | null>>;
  setActiveClipId: Dispatch<SetStateAction<string | null>>;
  setClipPaused: Dispatch<SetStateAction<boolean>>;
  setClipError: Dispatch<SetStateAction<string | null>>;
  setSheetOpen: Dispatch<SetStateAction<boolean>>;
  setSheetTab: Dispatch<SetStateAction<AnatomySheetTab>>;
  setMoreAnchor: Dispatch<SetStateAction<HTMLElement | null>>;
};

export function useAnatomyViewerManifest({
  sceneId,
  initialRegions,
  dispatch,
  setAutoRotate,
  setWireframe,
  setFadeOthers,
  setAutoFocus,
  setCameraMode,
  setHelpOpen,
  setBgId,
  setStudyMode,
  setRevealedIds,
  setMakeCardsOpen,
  setMakeCardsNotice,
  setActiveClipId,
  setClipPaused,
  setClipError,
  setSheetOpen,
  setSheetTab,
  setMoreAnchor,
}: Args) {
  const [manifest, setManifest] = useState<AnatomySceneManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeRegions, setActiveRegions] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    dispatch({ type: "reset" });
    setAutoRotate(false);
    setWireframe(false);
    setFadeOthers(false);
    setAutoFocus(true);
    setCameraMode("perspective");
    setHelpOpen(false);
    setBgId("page");
    setStudyMode("explore");
    setRevealedIds(new Set());
    setMakeCardsOpen(false);
    setMakeCardsNotice(null);
    setActiveClipId(null);
    setClipPaused(false);
    setClipError(null);
    setSheetOpen(false);
    setSheetTab("structures");
    setMoreAnchor(null);
  }, [sceneId]);

  useEffect(() => {
    let cancelled = false;
    setManifest(null);
    setError(null);
    setActiveRegions(new Set());
    void (async () => {
      try {
        const res = await fetch(
          `/anatomy/${encodeURIComponent(sceneId)}/scene.json`,
        );
        if (!res.ok) throw new Error(`Could not load scene (${res.status})`);
        const json: unknown = await res.json();
        const parsed = parseAnatomySceneManifest(json);
        if (parsed.id !== sceneId) {
          throw new Error("Scene id mismatch");
        }
        if (!cancelled) {
          setManifest(parsed);
          setActiveRegions(
            new Set(activeRegionIdsForOpen(parsed, initialRegions)),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load scene");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // initialRegions applied on mount; parent remounts when the region key changes.
  }, [sceneId]);

  return {
    manifest,
    error,
    activeRegions,
    setActiveRegions,
  };
}
