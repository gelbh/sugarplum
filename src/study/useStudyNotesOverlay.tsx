import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import StudyNotesDialog from "../components/StudyNotesDialog";
import {
  provenanceExcerptText,
  provenancePages,
} from "./regenSource";

export type StudyNotesCard = {
  id: string;
  provenance: unknown;
  job_id: string | null;
  deck_id: string;
};

export type StudyNotesOverlay = {
  notesOpenRef: { readonly current: boolean };
  notesAvailable: boolean;
  openNotes: () => void;
  dialog: ReactNode;
};

/** Open/close Notes overlay for the current study card; resets on card change. */
export function useStudyNotesOverlay(
  card: StudyNotesCard | null,
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
    notesOpenRef,
    notesAvailable,
    openNotes,
    dialog: card ? (
      <StudyNotesDialog
        open={notesOpen}
        onClose={closeNotes}
        excerpt={notesExcerpt}
        page={notesPages[0] ?? null}
        jobId={card.job_id}
        deckId={card.deck_id}
      />
    ) : null,
  };
}
