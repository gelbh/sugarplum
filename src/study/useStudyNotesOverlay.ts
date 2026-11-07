import { useCallback, useEffect, useRef, useState } from "react";
import {
  provenanceExcerptText,
  provenancePages,
} from "./regenSource";

export type StudyNotesOverlay = {
  notesOpen: boolean;
  notesOpenRef: { readonly current: boolean };
  notesAvailable: boolean;
  notesExcerpt: string;
  page: number | null;
  openNotes: () => void;
  closeNotes: () => void;
};

/** Open/close Notes overlay for the current study card; resets on card change. */
export function useStudyNotesOverlay(
  card: { id: string; provenance: unknown } | null,
): StudyNotesOverlay {
  const [notesOpen, setNotesOpenState] = useState(false);
  const notesOpenRef = useRef(false);
  const setNotesOpen = useCallback((open: boolean) => {
    notesOpenRef.current = open;
    setNotesOpenState(open);
  }, []);
  const openNotes = useCallback(() => setNotesOpen(true), [setNotesOpen]);
  const closeNotes = useCallback(() => setNotesOpen(false), [setNotesOpen]);

  useEffect(() => {
    setNotesOpen(false);
  }, [card?.id, setNotesOpen]);

  const notesExcerpt = card ? provenanceExcerptText(card.provenance) : "";
  const notesPages = card ? provenancePages(card.provenance) : [];
  const notesAvailable = notesExcerpt !== "" || notesPages.length > 0;

  return {
    notesOpen,
    notesOpenRef,
    notesAvailable,
    notesExcerpt,
    page: notesPages[0] ?? null,
    openNotes,
    closeNotes,
  };
}
