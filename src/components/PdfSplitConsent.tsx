import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";

export type PdfSplitConsentProps = {
  open: boolean;
  fileName: string;
  partCountEstimate?: number;
  progressLabel?: string | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function PdfSplitConsent({
  open,
  fileName,
  partCountEstimate,
  progressLabel,
  busy = false,
  onConfirm,
  onCancel,
}: PdfSplitConsentProps) {
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onCancel();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Large PDF</DialogTitle>
      <DialogContent>
        <DialogContentText>
          “{fileName}” is larger than 50MB. Split it into multiple materials
          each under 50MB? Each part starts generation after upload.
          {partCountEstimate != null
            ? ` About ${partCountEstimate} parts expected.`
            : null}
        </DialogContentText>
        {progressLabel ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {progressLabel}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="contained" disabled={busy}>
          {busy ? "Working…" : "Split and upload"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
