import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { AnatomyCanvasHandle } from "./AnatomyCanvas";
import type { StructureUiAction, StructureUiState } from "../structure/structureState";

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

type Args = {
  ui: StructureUiState;
  dispatch: Dispatch<StructureUiAction>;
  canvasRef: RefObject<AnatomyCanvasHandle | null>;
  setHelpOpen: Dispatch<SetStateAction<boolean>>;
};

export function useAnatomyViewerKeys({
  ui,
  dispatch,
  canvasRef,
  setHelpOpen,
}: Args) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (isTypingTarget(ev.target)) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const key = ev.key.toLowerCase();
      if (key === "h") {
        if (!ui.selectedId) return;
        ev.preventDefault();
        dispatch({ type: "toggleHidden", id: ui.selectedId });
        return;
      }
      if (key === "i") {
        if (!ui.selectedId) return;
        ev.preventDefault();
        dispatch(
          ui.isolatedId === ui.selectedId
            ? { type: "clearIsolate" }
            : { type: "isolate", id: ui.selectedId },
        );
        return;
      }
      if (key === "r") {
        ev.preventDefault();
        canvasRef.current?.resetView();
        return;
      }
      if (key === "?" || (ev.shiftKey && key === "/")) {
        ev.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui.selectedId, ui.isolatedId, dispatch, canvasRef, setHelpOpen]);
}
