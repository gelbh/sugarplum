import { useCallback, useEffect, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  ApiError,
  createDeck,
  deckStats,
  deleteDeck,
  deleteSubject,
  listDecks,
  listSubjects,
  me,
  patchDeck,
  patchSubject,
  type Deck,
  type DeckStats,
  type Subject,
} from "../api/client";
import { navigate } from "../nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";
import { subjectDeleteBlocked } from "../subjects/subjectDeleteGuard";

type Props = {
  subjectId: string;
};

type TitleDialog =
  | { kind: "subject" }
  | { kind: "deck-create" }
  | { kind: "deck-rename"; deck: Deck }
  | null;

export default function SubjectPage({ subjectId }: Props) {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [titleDialog, setTitleDialog] = useState<TitleDialog>(null);
  const [titleValue, setTitleValue] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Deck | null>(null);
  const [deleteStats, setDeleteStats] = useState<DeckStats | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const { end: endLoad } = useTrackedOp("Loading subject…", {
    trackOnMount: true,
  });

  const load = useCallback(async () => {
    const [subjects, deckList] = await Promise.all([
      listSubjects(),
      listDecks(subjectId),
    ]);
    const found = subjects.find((s) => s.id === subjectId) ?? null;
    setSubject(found);
    setDecks(deckList);
    return found;
  }, [subjectId]);

  const syncSubjectFromList = useCallback(async () => {
    const subjects = await listSubjects();
    const found = subjects.find((s) => s.id === subjectId) ?? null;
    setSubject(found);
    return found;
  }, [subjectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        const found = await load();
        if (cancelled) return;
        if (!found) {
          setError("Subject not found");
        }
        setReady(true);
        endLoad();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Failed to load subject",
        );
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad, load]);

  function openRenameSubject() {
    if (!subject) return;
    setDialogError(null);
    setTitleValue(subject.title);
    setTitleDialog({ kind: "subject" });
  }

  function openCreateDeck() {
    setDialogError(null);
    setTitleValue("");
    setTitleDialog({ kind: "deck-create" });
  }

  function openRenameDeck(deck: Deck) {
    setDialogError(null);
    setTitleValue(deck.title);
    setTitleDialog({ kind: "deck-rename", deck });
  }

  async function onTitleDialogSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!titleDialog || !titleValue.trim()) return;
    setDialogBusy(true);
    setDialogError(null);
    try {
      if (titleDialog.kind === "subject") {
        const updated = await patchSubject(subjectId, titleValue.trim());
        setSubject((prev) => (prev ? { ...prev, ...updated } : updated));
      } else if (titleDialog.kind === "deck-create") {
        const deck = await createDeck(titleValue.trim(), subjectId);
        setDecks((prev) => [...prev, deck]);
        await syncSubjectFromList();
      } else {
        const updated = await patchDeck(titleDialog.deck.id, titleValue.trim());
        setDecks((prev) =>
          prev.map((d) => (d.id === updated.id ? updated : d)),
        );
      }
      setTitleDialog(null);
    } catch (err) {
      setDialogError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setDialogBusy(false);
    }
  }

  async function onDeleteSubject() {
    if (!subject || subjectDeleteBlocked(subject, decks.length)) return;
    setError(null);
    try {
      await deleteSubject(subject.id);
      navigate("/library");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete subject",
      );
    }
  }

  async function openDeleteDeck(deck: Deck) {
    setError(null);
    setDeleteTarget(deck);
    setDeleteStats(null);
    try {
      setDeleteStats(await deckStats(deck.id));
    } catch (err) {
      setDeleteTarget(null);
      setError(
        err instanceof ApiError ? err.message : "Could not load deck stats",
      );
    }
  }

  async function confirmDeleteDeck() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await deleteDeck(deleteTarget.id);
      setDecks((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      await syncSubjectFromList();
      setDeleteTarget(null);
      setDeleteStats(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete deck");
    } finally {
      setDeleteBusy(false);
    }
  }

  const deleteSubjectBlocked = subject
    ? subjectDeleteBlocked(subject, decks.length)
    : decks.length > 0;
  const dialogTitle =
    titleDialog?.kind === "subject"
      ? "Rename subject"
      : titleDialog?.kind === "deck-create"
        ? "Create deck"
        : titleDialog?.kind === "deck-rename"
          ? "Rename deck"
          : "";

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 5 } }}>
      {!ready ? (
        <Typography color="text.secondary">Loading subject…</Typography>
      ) : (
        <Stack spacing={3}>
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <Link
                href="/library"
                underline="hover"
                color="primary"
                onClick={(ev) => {
                  ev.preventDefault();
                  navigate("/library");
                }}
              >
                Library
              </Link>
            </Typography>
            <Stack
              direction="row"
              alignItems="flex-start"
              justifyContent="space-between"
              gap={1}
            >
              <Typography
                variant="h4"
                component="h1"
                sx={{ color: "text.primary", fontWeight: 600, flex: 1 }}
              >
                {subject?.title ?? "Subject"}
              </Typography>
              {subject ? (
                <Stack direction="row" spacing={0.5}>
                  <IconButton
                    size="small"
                    aria-label="Rename subject"
                    onClick={openRenameSubject}
                  >
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                  <Tooltip
                    title={
                      deleteSubjectBlocked
                        ? "Remove decks before deleting this subject"
                        : "Delete subject"
                    }
                  >
                    <span>
                      <IconButton
                        size="small"
                        aria-label="Delete subject"
                        disabled={deleteSubjectBlocked}
                        onClick={onDeleteSubject}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              ) : null}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Decks in this subject.
            </Typography>
          </Box>

          {error ? <Alert severity="error">{error}</Alert> : null}

          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              bgcolor: "background.paper",
              borderColor: "divider",
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1.5 }}
            >
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, color: "primary.main" }}
              >
                Decks
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={openCreateDeck}
                disabled={!subject}
              >
                Create deck
              </Button>
            </Stack>
            {decks.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No decks yet. Create one to add materials.
              </Typography>
            ) : (
              <Stack
                component="ul"
                spacing={0}
                divider={<Divider flexItem />}
                sx={{ m: 0, p: 0, listStyle: "none" }}
              >
                {decks.map((d) => (
                  <Box
                    component="li"
                    key={d.id}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      py: 1,
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ flex: 1, minWidth: 0 }}
                      noWrap
                    >
                      {d.title}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label={`Rename ${d.title}`}
                      onClick={() => openRenameDeck(d)}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label={`Delete ${d.title}`}
                      onClick={() => openDeleteDeck(d)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Stack>
      )}

      <Dialog
        open={titleDialog !== null}
        onClose={() => !dialogBusy && setTitleDialog(null)}
        fullWidth
        maxWidth="xs"
      >
        <Box component="form" onSubmit={onTitleDialogSubmit} noValidate>
          <DialogTitle>{dialogTitle}</DialogTitle>
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
        open={deleteTarget !== null}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
      >
        <DialogTitle>Delete deck?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget && deleteStats
              ? `Delete “${deleteTarget.title}”? This removes ${deleteStats.accepted} accepted card${deleteStats.accepted === 1 ? "" : "s"}, ${deleteStats.draft} draft${deleteStats.draft === 1 ? "" : "s"}, and ${deleteStats.materials} material${deleteStats.materials === 1 ? "" : "s"}.`
              : deleteTarget
                ? `Loading counts for “${deleteTarget.title}”…`
                : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteBusy || !deleteStats}
            onClick={confirmDeleteDeck}
          >
            {deleteBusy ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
