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
import Typography from "@mui/material/Typography";
import CoverPickerDialog from "../components/CoverPickerDialog";
import DialogEyebrow from "../ui/DialogEyebrow";
import type { StoredCoverRow, Subject } from "../api/client";
import type {
  LibraryCoverTarget,
  LibraryTitleDialog,
} from "./useLibrarySubjectDialogs";
import { shouldAutoFocusText } from "../lib/autoFocusText";

type Props = {
  guest: boolean;
  titleDialog: LibraryTitleDialog;
  setTitleDialog: (value: LibraryTitleDialog) => void;
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
  coverPicker: LibraryCoverTarget | null;
  setCoverPicker: (value: LibraryCoverTarget | null) => void;
  closeCoverPicker: () => void;
  /** When true, create-flow cover is handled inline on LibraryPage. */
  suppressCoverDialog?: boolean;
  setCovers: (updater: (prev: StoredCoverRow[]) => StoredCoverRow[]) => void;
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
  closeCoverPicker,
  suppressCoverDialog = false,
  setCovers,
  onClearCover,
}: Props) {
  return (
    <>
      <Dialog
        open={titleDialog?.mode === "rename"}
        onClose={() => !dialogBusy && setTitleDialog(null)}
        fullWidth
        maxWidth="xs"
        slotProps={{
          paper: {
            sx: {
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "background.paper",
            },
          }
        }}
      >
        <Box component="form" onSubmit={onTitleDialogSubmit} noValidate>
          <Box
            sx={{
              px: 3,
              pt: 2.5,
              pb: 1.5,
              borderBottom: 1,
              borderColor: "divider",
              background:
                "linear-gradient(180deg, rgba(91, 44, 111, 0.12) 0%, transparent 100%)",
            }}
          >
            <DialogEyebrow label="Rename" />
            <DialogTitle
              sx={{
                p: 0,
                fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
                fontWeight: 400,
                letterSpacing: "0.02em",
                lineHeight: 1.15,
                fontSize: "1.75rem",
              }}
            >
              Update the name
            </DialogTitle>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mt: 1,
                maxWidth: "36ch"
              }}>
              Shown on the Library cover and in menus.
            </Typography>
          </Box>
          <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
            {dialogError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {dialogError}
              </Alert>
            ) : null}
            <TextField
              autoFocus={shouldAutoFocusText()}
              margin="none"
              label="Subject name"
              placeholder="e.g. Anatomy"
              value={titleValue}
              onChange={(ev) => setTitleValue(ev.target.value)}
              required
              fullWidth
              helperText={`${titleValue.trim().length}/80`}
              slotProps={{
                htmlInput: { maxLength: 80, "aria-label": "Subject name" },
                formHelperText: { sx: { textAlign: "right", mx: 0 } }
              }} />
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <Button
              onClick={() => setTitleDialog(null)}
              disabled={dialogBusy}
              sx={{ color: "text.secondary" }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={dialogBusy || !titleValue.trim()}
              sx={{ minWidth: 112 }}
            >
              {dialogBusy ? "Saving…" : "Save"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={deleteSubjectTarget !== null}
        onClose={() => !deleteSubjectBusy && setDeleteSubjectTarget(null)}
        fullWidth
        maxWidth="xs"
        slotProps={{
          paper: {
            sx: {
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "background.paper",
            },
          }
        }}
      >
        <Box
          sx={{
            px: 3,
            pt: 2.5,
            pb: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            background:
              "linear-gradient(180deg, rgba(183, 28, 28, 0.1) 0%, transparent 100%)",
          }}
        >
          <DialogEyebrow label="Delete" tone="error" />
          <DialogTitle
            sx={{
              p: 0,
              fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
              fontWeight: 400,
              letterSpacing: "0.02em",
              lineHeight: 1.15,
              fontSize: "1.75rem",
            }}
          >
            Remove this subject?
          </DialogTitle>
        </Box>
        <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
          <DialogContentText sx={{ color: "text.secondary" }}>
            {deleteSubjectTarget ? (
              <>
                Delete{" "}
                <Box component="strong" sx={{ color: "text.primary" }}>
                  {deleteSubjectTarget.title}
                </Box>
                ? This only works when the subject has no decks.
              </>
            ) : null}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setDeleteSubjectTarget(null)}
            disabled={deleteSubjectBusy}
            sx={{ color: "text.secondary" }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteSubjectBusy}
            onClick={confirmDeleteSubject}
            sx={{ minWidth: 112 }}
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

      {guest || suppressCoverDialog ? null : (
        <CoverPickerDialog
          open={coverPicker !== null}
          title={coverPicker?.title ?? ""}
          ownerKind={coverPicker?.ownerKind ?? "subject"}
          ownerId={coverPicker?.ownerId ?? ""}
          onClose={closeCoverPicker}
          onSaved={(row) => {
            setCovers((prev) => [
              row,
              ...prev.filter(
                (cover) =>
                  cover.ownerKind !== row.ownerKind ||
                  cover.ownerId !== row.ownerId,
              ),
            ]);
            closeCoverPicker();
          }}
          onClear={onClearCover}
        />
      )}
    </>
  );
}
