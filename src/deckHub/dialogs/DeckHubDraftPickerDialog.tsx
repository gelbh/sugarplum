import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DialogEyebrow from "../../shared/ui/DialogEyebrow";
import type { JobListItem } from "../../api/client";
import { DIALOG_TITLE_SX } from "./deckHubDialogSx";

type Props = {
  open: boolean;
  jobs: JobListItem[];
  onClose: () => void;
  onPickJob: (jobId: string) => void;
};

export default function DeckHubDraftPickerDialog({
  open,
  jobs,
  onClose,
  onPickJob,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "background.paper",
          },
        },
      }}
    >
      <DialogEyebrow label="Drafts" />
      <DialogTitle sx={DIALOG_TITLE_SX}>Choose a draft job</DialogTitle>
      <DialogContent sx={{ px: 3, pt: 1, pb: 1 }}>
        <Stack spacing={1}>
          {jobs.map((job) => (
            <Button
              key={job.id}
              variant="outlined"
              onClick={() => onPickJob(job.id)}
              sx={{
                justifyContent: "flex-start",
                textTransform: "none",
                borderRadius: 2,
                py: 1.25,
              }}
            >
              <Stack
                spacing={0.25}
                sx={{
                  alignItems: "flex-start",
                  minWidth: 0,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {job.filename?.trim() || job.deck_title || "Draft job"}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                  }}
                >
                  {job.draft_count} draft
                  {job.draft_count === 1 ? "" : "s"} ·{" "}
                  {new Date(job.created_at).toLocaleString()}
                </Typography>
              </Stack>
            </Button>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
