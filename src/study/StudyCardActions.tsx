import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  ApiError,
  asRegenType,
  cardHasRegenSource,
  deleteCard,
  patchCard,
  regenCard,
  type CardDraftView,
} from "../api/client";
import { cardPatchBody } from "../cards/cardPatchBody";
import DraftCardEditor, {
  type DraftEditorChange,
} from "../components/DraftCardEditor";
import { isGuest } from "../guest/session";
import { hubDiyTypes } from "../lib/hubDiyCreate";
import { dropPendingGrade } from "./pendingGrades";

type StudyCardActionsProps = {
  card: CardDraftView;
  hidden: boolean;
  gradeBusy: boolean;
  offlineCopy: boolean;
  userId: string | null;
  onDialogOpen: (open: boolean) => void;
  onSaved: (card: CardDraftView) => void;
  onRegenerated: (card: CardDraftView) => void;
  onRemoved: (cardId: string) => void;
};

export function StudyCardActions({
  card,
  hidden,
  gradeBusy,
  offlineCopy,
  userId,
  onDialogOpen,
  onSaved,
  onRegenerated,
  onRemoved,
}: StudyCardActionsProps) {
  const [editCard, setEditCard] = useState<CardDraftView | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [cardRegenBusy, setCardRegenBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const editDialogBusy = editBusy || cardRegenBusy;
  const dialogOpen = editCard !== null || deleteId !== null;

  useEffect(() => {
    onDialogOpen(dialogOpen);
  }, [dialogOpen, onDialogOpen]);

  useEffect(() => {
    if (!hidden) return;
    setEditCard(null);
    setDeleteId(null);
  }, [hidden]);

  function openEdit() {
    if (gradeBusy || offlineCopy) return;
    setEditError(null);
    setEditCard({
      ...card,
      options: card.options ? [...card.options] : undefined,
    });
  }

  function onEditChange(next: DraftEditorChange) {
    setEditCard((prev) =>
      prev
        ? {
            ...prev,
            front: next.front,
            back: next.back,
            type: next.type,
            ...(next.options !== undefined ? { options: next.options } : {}),
          }
        : prev,
    );
  }

  async function saveEdit() {
    if (!editCard || editBusy) return;
    setEditBusy(true);
    setEditError(null);
    try {
      const updated = await patchCard(editCard.id, cardPatchBody(editCard));
      onSaved(updated);
      setEditCard(null);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Could not save card");
    } finally {
      setEditBusy(false);
    }
  }

  async function onRegenEditCard() {
    if (!editCard || isGuest()) return;
    const type = asRegenType(editCard.type);
    if (type === null || !cardHasRegenSource(editCard)) return;
    setCardRegenBusy(true);
    setEditError(null);
    try {
      const updated = await regenCard(editCard.id, { type });
      onRegenerated(updated);
      setEditCard(updated);
    } catch (err) {
      setEditError(
        err instanceof ApiError ? err.message : "Could not regenerate card",
      );
    } finally {
      setCardRegenBusy(false);
    }
  }

  async function onConfirmDelete() {
    if (!deleteId || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteCard(deleteId);
      if (userId) dropPendingGrade(userId, deleteId);
      onRemoved(deleteId);
      setDeleteId(null);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Could not delete card",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  const controlsDisabled =
    offlineCopy || editDialogBusy || deleteBusy || gradeBusy;

  return (
    <>
      {hidden ? null : (
        <Stack direction="row" spacing={0.5} sx={{ alignSelf: "flex-end" }}>
          <IconButton
            size="small"
            aria-label="Edit card"
            disabled={controlsDisabled}
            onClick={openEdit}
          >
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label="Delete card"
            disabled={controlsDisabled}
            onClick={() => {
              if (gradeBusy || offlineCopy) return;
              setDeleteError(null);
              setDeleteId(card.id);
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
      )}
      <Dialog
        open={editCard !== null}
        onClose={() => !editDialogBusy && setEditCard(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit card</DialogTitle>
        <DialogContent>
          {editError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          ) : null}
          {editCard ? (
            <Box sx={{ pt: 1 }}>
              <DraftCardEditor
                card={editCard}
                disabled={editDialogBusy}
                onChange={onEditChange}
                allowedTypes={hubDiyTypes(isGuest())}
                regenAction={
                  isGuest()
                    ? undefined
                    : {
                        busy: cardRegenBusy,
                        disabled:
                          asRegenType(editCard.type) === null ||
                          !cardHasRegenSource(editCard),
                        onClick: () => {
                          void onRegenEditCard();
                        },
                      }
                }
              />
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditCard(null)} disabled={editDialogBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={editDialogBusy || !editCard}
            onClick={() => void saveEdit()}
          >
            {editBusy ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={deleteId !== null}
        onClose={() => !deleteBusy && setDeleteId(null)}
      >
        <DialogTitle>Delete this card?</DialogTitle>
        <DialogContent>
          {deleteError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          ) : null}
          <DialogContentText>
            This removes it from the deck, including its review history. You
            cannot undo this.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)} disabled={deleteBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={deleteBusy}
            onClick={() => void onConfirmDelete()}
          >
            {deleteBusy ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
