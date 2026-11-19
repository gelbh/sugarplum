import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import CoverPickerPanel from "./CoverPickerPanel";
import type { CoverOwnerKind, StoredCoverRow } from "../api/client";

type Props = {
  open: boolean;
  title: string;
  ownerKind: CoverOwnerKind;
  ownerId: string;
  onClose: () => void;
  onSaved: (row: StoredCoverRow) => void;
  onClear: () => void;
};

export default function CoverPickerDialog({
  open,
  title,
  ownerKind,
  ownerId,
  onClose,
  onSaved,
  onClear,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          variant: "outlined",
          elevation: 0,
          sx: { bgcolor: "background.paper" },
        },
      }}
    >
      <DialogTitle>Choose a cover</DialogTitle>
      <DialogContent>
        <CoverPickerPanel
          active={open}
          title={title}
          ownerKind={ownerKind}
          ownerId={ownerId}
          onSaved={onSaved}
          onClear={onClear}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
