import Button from "@mui/material/Button";
import type { MouseEvent } from "react";
import KeyChip from "../KeyChip";
import { FACE_SANS } from "../studyFaceSx";

export function StudyNotesButton({ onOpenNotes }: { onOpenNotes: () => void }) {
  return (
    <Button
      variant="text"
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        onOpenNotes();
      }}
      aria-keyshortcuts="s"
      sx={{
        fontFamily: FACE_SANS,
        minHeight: 44,
        color: "inherit",
        flexShrink: 0,
      }}
    >
      Notes
      <KeyChip label="S" ml={1} />
    </Button>
  );
}
