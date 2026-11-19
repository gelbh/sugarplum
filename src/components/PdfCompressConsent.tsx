import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { fileSizeCapMb } from "../lib/materialUploadLimits";

export type PdfCompressConsentProps = {
  open: boolean;
  fileName: string;
  maxMb?: number;
  progressLabel?: string | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function PdfCompressConsent({
  open,
  fileName,
  maxMb = fileSizeCapMb(),
  progressLabel,
  busy = false,
  onConfirm,
  onCancel,
}: PdfCompressConsentProps) {
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onCancel();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Oversized page</DialogTitle>
      <DialogContent>
        <DialogContentText>
          “{fileName}” has a single page larger than {maxMb}MB, so splitting
          cannot help. Compress it in the browser (scan quality may drop), then
          upload as one material?
        </DialogContentText>
        {progressLabel ? (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 2
            }}>
            {progressLabel}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="contained" disabled={busy}>
          {busy ? "Working…" : "Compress and upload"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
