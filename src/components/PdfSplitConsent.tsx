import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { fileSizeCapMb } from "../lib/materialUploadLimits";

export type PdfSplitConsentProps = {
  open: boolean;
  fileName: string;
  maxMb?: number;
  figuresWillSkip?: boolean;
  progressLabel?: string | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function PdfSplitConsent({
  open,
  fileName,
  maxMb = fileSizeCapMb(),
  figuresWillSkip = false,
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
          “{fileName}” is larger than {maxMb}MB. Split it into multiple materials
          each under {maxMb}MB? Each part starts generation after upload.
        </DialogContentText>
        {figuresWillSkip ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Attached figure crops apply only if this PDF fits in one part.
            Multi-part splits skip figure crops.
          </Typography>
        ) : null}
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
