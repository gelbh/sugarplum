import type { FormEvent, MouseEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import CoverPickerDialog from "../components/CoverPickerDialog";
import type { StoredCoverRow, Subject } from "../api/client";

type TitleDialog =
  | { mode: "create" }
  | { mode: "rename"; subject: Subject }
  | null;

type CoverTarget = {
  ownerKind: "subject";
  ownerId: string;
  title: string;
};

type Props = {
  guest: boolean;
  titleDialog: TitleDialog;
  setTitleDialog: (value: TitleDialog) => void;
  titleValue: string;
  setTitleValue: (value: string) => void;
  dialogBusy: boolean;
  dialogError: string | null;
  onTitleDialogSubmit: (e?: FormEvent) => void | Promise<void>;
  deleteSubjectTarget: Subject | null;
  setDeleteSubjectTarget: (value: Subject | null) => void;
  deleteSubjectBusy: boolean;
  confirmDeleteSubject: () => void | Promise<void>;
  subjectMenu: { anchor: HTMLElement; subject: Subject } | null;
  setSubjectMenu: (
    value: { anchor: HTMLElement; subject: Subject } | null,
  ) => void;
  menuSubject: Subject | null;
  menuDeleteBlocked: boolean;
  openRenameSubject: (subject: Subject, ev: MouseEvent) => void;
  requestDeleteSubject: (subject: Subject, ev: MouseEvent) => void;
  coverPicker: CoverTarget | null;
  setCoverPicker: (value: CoverTarget | null) => void;
  setCovers: (
    updater: (prev: StoredCoverRow[]) => StoredCoverRow[],
  ) => void;
  onClearCover: () => void | Promise<void>;
};

export function LibraryDialogs({
  guest,
  titleDialog,
  setTitleDialog,
  titleValue,
  setTitleValue,
  dialogBusy,
  dialogError,
  onTitleDialogSubmit,
  deleteSubjectTarget,
  setDeleteSubjectTarget,
  deleteSubjectBusy,
  confirmDeleteSubject,
  subjectMenu,
  setSubjectMenu,
  menuSubject,
  menuDeleteBlocked,
  openRenameSubject,
  requestDeleteSubject,
  coverPicker,
  setCoverPicker,
  setCovers,
  onClearCover,
}: Props) {
  return (
    <>
      <Dialog
        open={titleDialog !== null}
        onClose={() => !dialogBusy && setTitleDialog(null)}
        fullWidth
        maxWidth="xs"
      >
        <Box component="form" onSubmit={onTitleDialogSubmit} noValidate>
          <DialogTitle>
            {titleDialog?.mode === "rename"
              ? "Rename subject"
              : "Create subject"}
          </DialogTitle>
          <DialogContent>
            {dialogError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {dialogError}
              </Alert>
            ) : null}
            <TextField
              autoFocus
              margin="dense"
              label="Title"
              value={titleValue}
              onChange={(ev) => setTitleValue(ev.target.value)}
              required
              fullWidth
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTitleDialog(null)} disabled={dialogBusy}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={dialogBusy || !titleValue.trim()}
            >
              {dialogBusy ? "Saving…" : "Save"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={deleteSubjectTarget !== null}
        onClose={() => !deleteSubjectBusy && setDeleteSubjectTarget(null)}
      >
        <DialogTitle>Delete subject?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteSubjectTarget
              ? `Delete “${deleteSubjectTarget.title}”? This only works when the subject has no decks.`
              : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteSubjectTarget(null)}
            disabled={deleteSubjectBusy}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteSubjectBusy}
            onClick={confirmDeleteSubject}
          >
            {deleteSubjectBusy ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Menu
        anchorEl={subjectMenu?.anchor ?? null}
        open={subjectMenu !== null}
        onClose={() => setSubjectMenu(null)}
      >
        <MenuItem
          onClick={(ev) => {
            if (!menuSubject) return;
            openRenameSubject(menuSubject, ev);
            setSubjectMenu(null);
          }}
        >
          Rename
        </MenuItem>
        {!guest ? (
          <MenuItem
            onClick={() => {
              if (!menuSubject) return;
              setCoverPicker({
                ownerKind: "subject",
                ownerId: menuSubject.id,
                title: menuSubject.title,
              });
              setSubjectMenu(null);
            }}
          >
            Change cover
          </MenuItem>
        ) : null}
        {menuDeleteBlocked ? (
          <Tooltip title="Remove or move decks before deleting this subject">
            <span>
              <MenuItem
                disabled
                onClick={(ev) => {
                  if (!menuSubject) return;
                  requestDeleteSubject(menuSubject, ev);
                  setSubjectMenu(null);
                }}
              >
                Delete
              </MenuItem>
            </span>
          </Tooltip>
        ) : (
          <MenuItem
            onClick={(ev) => {
              if (!menuSubject) return;
              requestDeleteSubject(menuSubject, ev);
              setSubjectMenu(null);
            }}
          >
            Delete
          </MenuItem>
        )}
      </Menu>

      {guest ? null : (
        <CoverPickerDialog
          open={coverPicker !== null}
          title={coverPicker?.title ?? ""}
          ownerKind={coverPicker?.ownerKind ?? "subject"}
          ownerId={coverPicker?.ownerId ?? ""}
          onClose={() => setCoverPicker(null)}
          onSaved={(row) => {
            setCovers((prev) => [
              row,
              ...prev.filter(
                (cover) =>
                  cover.ownerKind !== row.ownerKind ||
                  cover.ownerId !== row.ownerId,
              ),
            ]);
            setCoverPicker(null);
          }}
          onClear={onClearCover}
        />
      )}
    </>
  );
}
