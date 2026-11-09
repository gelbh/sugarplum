import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { StudyNotesButton } from "./StudyNotesButton";
import { OVERLINE_SX } from "./studyFaceSx";

export function FaceOverline({
  label,
  notesAvailable,
  onOpenNotes,
}: {
  label: string;
  notesAvailable?: boolean;
  onOpenNotes?: () => void;
}) {
  return (
    <Box
      sx={{
        mb: 2,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        width: "100%",
      }}
    >
      <Typography component="div" sx={OVERLINE_SX}>
        {label}
      </Typography>
      {notesAvailable && onOpenNotes ? (
        <StudyNotesButton onOpenNotes={onOpenNotes} />
      ) : null}
    </Box>
  );
}
