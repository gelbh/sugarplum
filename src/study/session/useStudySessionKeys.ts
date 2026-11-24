import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { CardDraftView, StudyRating } from "../../api/client";
import {
  faceScrollsFor,
  plainShortcutKey,
  resolveStudyKey,
} from "./studyKeys";
import { isMcqCard } from "../faces/studyCardPresentation";

type NotesKeys = {
  notesOpenRef: MutableRefObject<boolean>;
  notesAvailable: boolean;
  openNotes: () => void;
};

type Args = {
  ready: boolean;
  current: CardDraftView | null;
  revealed: boolean;
  notes: NotesKeys;
  leaveStudy: () => void;
  mobile: boolean;
  toggleZen: () => void;
  busyRef: MutableRefObject<boolean>;
  flightBusyRef: MutableRefObject<boolean>;
  reveal: () => void;
  flipBack: () => void;
  onGrade: (rating: StudyRating) => void | Promise<boolean>;
  cardDialogOpenRef: MutableRefObject<boolean>;
  answerFocusRef: RefObject<HTMLElement | null>;
};

/**
 * Study keyboard shortcuts + Esc/fullscreen leave suppress.
 */
export function useStudySessionKeys({
  ready,
  current,
  revealed,
  notes,
  leaveStudy,
  mobile,
  toggleZen,
  busyRef,
  flightBusyRef,
  reveal,
  flipBack,
  onGrade,
  cardDialogOpenRef,
  answerFocusRef,
}: Args) {
  /** Suppress leave-on-Esc for one tick after FS exits (UA may clear FS before keydown). */
  const ignoreEscLeaveUntilRef = useRef(0);

  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        ignoreEscLeaveUntilRef.current = performance.now() + 500;
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!ready) return;

    function onKey(e: KeyboardEvent) {
      if (cardDialogOpenRef.current) return;
      if (notes.notesOpenRef.current) {
        // Keep zen: MUI closes the dialog but does not cancel Escape.
        if (e.key === "Escape") e.preventDefault();
        return;
      }
      const key = plainShortcutKey(e);
      if (key === null) return;
      if ((key === "s" || key === "S") && notes.notesAvailable) {
        e.preventDefault();
        notes.openNotes();
        return;
      }
      if (key === "Escape") {
        e.preventDefault();
        if (document.fullscreenElement) {
          ignoreEscLeaveUntilRef.current = performance.now() + 500;
          void document.exitFullscreen?.();
          return;
        }
        if (performance.now() < ignoreEscLeaveUntilRef.current) {
          return;
        }
        leaveStudy();
        return;
      }
      if (key === "z" || key === "Z") {
        e.preventDefault();
        if (!mobile) toggleZen();
        return;
      }
      if (
        isMcqCard(current) ||
        busyRef.current ||
        flightBusyRef.current ||
        !current
      )
        return;
      const action = resolveStudyKey(key, revealed);
      switch (action.type) {
        case "reveal":
          e.preventDefault();
          reveal();
          return;
        case "hide":
          e.preventDefault();
          flipBack();
          return;
        case "grade":
          if (
            faceScrollsFor(
              key,
              answerFocusRef.current?.closest("[data-card-face-content]") ??
                null,
            )
          ) {
            return;
          }
          e.preventDefault();
          void onGrade(action.rating);
          return;
        case "none":
          return;
        default: {
          const unhandled: never = action;
          void unhandled;
        }
      }
    }

    // Capture so Space flips before a focused Show answer button activates.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    answerFocusRef,
    busyRef,
    cardDialogOpenRef,
    current,
    flightBusyRef,
    flipBack,
    leaveStudy,
    mobile,
    notes.notesAvailable,
    notes.notesOpenRef,
    notes.openNotes,
    onGrade,
    ready,
    reveal,
    revealed,
    toggleZen,
  ]);
}
