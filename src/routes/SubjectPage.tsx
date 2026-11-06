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
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CoverPickerDialog from "../components/CoverPickerDialog";
import ShelfVolume from "../components/ShelfVolume";
import {
  ApiError,
  apkgFilenameForDeckTitle,
  clearCover,
  createDeck,
  createSubjectExport,
  deckStats,
  deleteDeck,
  deleteSubject,
  listCovers,
  listDecks,
  listSubjects,
  me,
  patchDeck,
  patchSubject,
  setCover,
  type Deck,
  type DeckStats,
  type StoredCoverRow,
  type Subject,
} from "../api/client";
import {
  formatExportWarnings,
  ANKI_EXPORT_BUSY_LABEL,
  runAnkiExportDownload,
} from "../export/runAnkiExport";
import { isGuest } from "../guest/session";
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

type CoverTarget = {
  ownerKind: "deck";
  ownerId: string;
  title: string;
};

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
  const [confirmSubjectDelete, setConfirmSubjectDelete] = useState(false);
  const [subjectDeleteBusy, setSubjectDeleteBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportWarning, setExportWarning] = useState<string | null>(null);
  const [pageMenu, setPageMenu] = useState<
    | { kind: "subject"; anchor: HTMLElement }
    | { kind: "deck"; anchor: HTMLElement; deck: Deck }
    | null
  >(null);
  const [covers, setCovers] = useState<StoredCoverRow[]>([]);
  const [coverPicker, setCoverPicker] = useState<CoverTarget | null>(null);
  const guest = isGuest();
  const { end: endLoad } = useTrackedOp("Loading subject…", {
    trackOnMount: true,
  });
  const { busy: exportBusy, run: runExport } =
    useTrackedOp(ANKI_EXPORT_BUSY_LABEL);

  const load = useCallback(async () => {
    const [subjects, deckList, coverList] = await Promise.all([
      listSubjects(),
      listDecks(subjectId),
      guest
        ? Promise.resolve([] as StoredCoverRow[])
        : listCovers().catch(() => [] as StoredCoverRow[]),
    ]);
    const found = subjects.find((s) => s.id === subjectId) ?? null;
    setSubject(found);
    setDecks(deckList);
    setCovers(coverList);
    return found;
  }, [guest, subjectId]);

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

  async function onPickCover(photoId: string) {
    if (!coverPicker) return;
    const row = await setCover(
      coverPicker.ownerKind,
      coverPicker.ownerId,
      photoId,
    );
    setCovers((prev) => [
      ...prev.filter(
        (cover) =>
          cover.ownerKind !== row.ownerKind || cover.ownerId !== row.ownerId,
      ),
      row,
    ]);
    setCoverPicker(null);
  }

  async function onClearCover() {
    if (!coverPicker) return;
    const { ownerKind, ownerId } = coverPicker;
    await clearCover(ownerKind, ownerId);
    setCovers((prev) =>
      prev.filter(
        (cover) => cover.ownerKind !== ownerKind || cover.ownerId !== ownerId,
      ),
    );
    setCoverPicker(null);
  }

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

  function requestDeleteSubject() {
    if (!subject || subjectDeleteBlocked(subject, decks.length)) return;
    setError(null);
    setConfirmSubjectDelete(true);
  }

  async function confirmDeleteSubject() {
    if (!subject) return;
    setSubjectDeleteBusy(true);
    setError(null);
    try {
      await deleteSubject(subject.id);
      setConfirmSubjectDelete(false);
      navigate("/library");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete subject",
      );
    } finally {
      setSubjectDeleteBusy(false);
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

  async function onExportAnki() {
    if (!subject || guest) return;
    setError(null);
    setNotice(null);
    setExportWarning(null);
    try {
      await runExport(async () => {
        const warnings = await runAnkiExportDownload(
          () => createSubjectExport(subject.id),
          apkgFilenameForDeckTitle(subject.title),
        );
        const warningText = formatExportWarnings(warnings);
        if (warningText) {
          setExportWarning(warningText);
        } else {
          setNotice("Anki package downloaded");
        }
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
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

  const menuDeck = pageMenu?.kind === "deck" ? pageMenu.deck : null;

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 5 } }}>
      {!ready ? (
        <Typography color="text.secondary">Loading subject…</Typography>
      ) : (
        <Stack spacing={3}>
          <Box>
            <Link
              href="/library"
              underline="hover"
              onClick={(ev) => {
                if (
                  ev.defaultPrevented ||
                  ev.button !== 0 ||
                  ev.metaKey ||
                  ev.ctrlKey ||
                  ev.shiftKey ||
                  ev.altKey
                ) {
                  return;
                }
                ev.preventDefault();
                navigate("/library");
              }}
              sx={{ display: "inline-block", mb: 1 }}
            >
              Library
            </Link>
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
                <IconButton
                  aria-label={`More actions for ${subject.title}`}
                  onClick={(ev) =>
                    setPageMenu({ kind: "subject", anchor: ev.currentTarget })
                  }
                  sx={{ color: "text.secondary" }}
                >
                  <MoreVertIcon />
                </IconButton>
              ) : null}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Choose a deck of flashcards.
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              flexWrap="wrap"
              useFlexGap
              sx={{ mt: 2 }}
            >
              {decks.length > 0 ? (
                <Button
                  size="small"
                  variant="contained"
                  onClick={() =>
                    navigate(
                      `/study?subjectId=${encodeURIComponent(subjectId)}`,
                    )
                  }
                >
                  Study all decks
                </Button>
              ) : null}
              <Button
                size="small"
                variant={decks.length === 0 ? "contained" : "outlined"}
                onClick={openCreateDeck}
                disabled={!subject}
              >
                New deck
              </Button>
            </Stack>
          </Box>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {notice ? (
            <Alert severity="success" onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          ) : null}
          {exportWarning ? (
            <Alert severity="warning" onClose={() => setExportWarning(null)}>
              {exportWarning}
            </Alert>
          ) : null}

          {decks.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No decks yet. Add one, then put your notes in it.
            </Typography>
          ) : (
            <Grid
              container
              component="ul"
              spacing={2}
              sx={{ listStyle: "none", p: 0, m: 0 }}
            >
              {decks.map((d) => {
                const href = `/library/decks/${encodeURIComponent(d.id)}`;
                return (
                  <Grid key={d.id} component="li" size={{ xs: 12, md: 6 }}>
                    <ShelfVolume
                      title={d.title}
                      href={href}
                      openLabel={`Open deck ${d.title}`}
                      onNavigate={(ev) => {
                        if (
                          ev.defaultPrevented ||
                          ev.button !== 0 ||
                          ev.metaKey ||
                          ev.ctrlKey ||
                          ev.shiftKey ||
                          ev.altKey
                        ) {
                          return;
                        }
                        ev.preventDefault();
                        navigate(href);
                      }}
                      studyLabel="Study"
                      onStudy={() =>
                        navigate(`/study?deckId=${encodeURIComponent(d.id)}`)
                      }
                      cover={
                        covers.find(
                          (cover) =>
                            cover.ownerKind === "deck" && cover.ownerId === d.id,
                        ) ?? null
                      }
                      moreLabel={`More actions for ${d.title}`}
                      onMore={(ev) =>
                        setPageMenu({
                          kind: "deck",
                          anchor: ev.currentTarget,
                          deck: d,
                        })
                      }
                    />
                  </Grid>
                );
              })}
            </Grid>
          )}
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
        open={confirmSubjectDelete}
        onClose={() => !subjectDeleteBusy && setConfirmSubjectDelete(false)}
      >
        <DialogTitle>Delete subject?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {subject
              ? `Delete “${subject.title}”? This only works when the subject has no decks.`
              : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmSubjectDelete(false)}
            disabled={subjectDeleteBusy}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={subjectDeleteBusy}
            onClick={confirmDeleteSubject}
          >
            {subjectDeleteBusy ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
      >
        <DialogTitle>Delete deck?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget && deleteStats
              ? `Delete “${deleteTarget.title}”? This removes ${deleteStats.accepted} accepted card${deleteStats.accepted === 1 ? "" : "s"}, ${deleteStats.draft} draft${deleteStats.draft === 1 ? "" : "s"}, ${deleteStats.archived} archived card${deleteStats.archived === 1 ? "" : "s"}, and ${deleteStats.materials} material${deleteStats.materials === 1 ? "" : "s"}.`
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

      <Menu
        anchorEl={pageMenu?.kind === "subject" ? pageMenu.anchor : null}
        open={pageMenu?.kind === "subject"}
        onClose={() => setPageMenu(null)}
      >
        <MenuItem
          onClick={() => {
            setPageMenu(null);
            openRenameSubject();
          }}
        >
          Rename subject
        </MenuItem>
        {deleteSubjectBlocked ? (
          <Tooltip title="Remove decks before deleting this subject">
            <span>
              <MenuItem disabled>Delete subject</MenuItem>
            </span>
          </Tooltip>
        ) : (
          <MenuItem
            onClick={() => {
              setPageMenu(null);
              requestDeleteSubject();
            }}
          >
            Delete subject
          </MenuItem>
        )}
        {!guest && decks.length > 0 ? (
          <MenuItem
            disabled={exportBusy}
            onClick={() => {
              setPageMenu(null);
              void onExportAnki();
            }}
          >
            {exportBusy ? "Exporting…" : "Download for Anki"}
          </MenuItem>
        ) : null}
      </Menu>

      <Menu
        anchorEl={pageMenu?.kind === "deck" ? pageMenu.anchor : null}
        open={menuDeck !== null}
        onClose={() => setPageMenu(null)}
      >
        <MenuItem
          onClick={() => {
            if (!menuDeck) return;
            setPageMenu(null);
            openRenameDeck(menuDeck);
          }}
        >
          Rename
        </MenuItem>
        {!guest ? (
          <MenuItem
            onClick={() => {
              if (!menuDeck) return;
              setCoverPicker({
                ownerKind: "deck",
                ownerId: menuDeck.id,
                title: menuDeck.title,
              });
              setPageMenu(null);
            }}
          >
            Change cover
          </MenuItem>
        ) : null}
        <MenuItem
          onClick={() => {
            if (!menuDeck) return;
            const deck = menuDeck;
            setPageMenu(null);
            void openDeleteDeck(deck);
          }}
        >
          Delete
        </MenuItem>
      </Menu>

      {guest ? null : (
        <CoverPickerDialog
          open={coverPicker !== null}
          title={coverPicker?.title ?? ""}
          onClose={() => setCoverPicker(null)}
          onPick={onPickCover}
          onClear={onClearCover}
        />
      )}
    </Container>
  );
}
