import { useCallback, useEffect, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import CoverPickerDialog from "../components/CoverPickerDialog";
import CoverPickerPanel from "../components/CoverPickerPanel";
import BoardTile from "../library/board/BoardTile";
import LibraryBoard from "../library/board/LibraryBoard";
import { coverPlaceholderColor } from "../library/board/coverPlaceholder";
import { LibraryCreateSubjectPanel } from "../library/LibraryCreateSubjectPanel";
import StageBreadcrumbs from "../library/StageBreadcrumbs";
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
  listJobsWithDrafts,
  listSubjects,
  patchDeck,
  patchSubject,
  subjectComposition,
  type Deck,
  type DeckStats,
  type JobListItem,
  type StoredCoverRow,
  type Subject,
  type SubjectKnowledge,
} from "../api/client";
import SubjectKnowledgeBar from "../components/SubjectKnowledgeBar";
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
  ownerKind: "subject" | "deck";
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
  const [pageMenu, setPageMenu] = useState<{
    anchor: HTMLElement;
    deck: Deck;
  } | null>(null);
  const [covers, setCovers] = useState<StoredCoverRow[]>([]);
  const [draftJobs, setDraftJobs] = useState<JobListItem[]>([]);
  const [coverPicker, setCoverPicker] = useState<CoverTarget | null>(null);
  /** Keeps the create pane mounted while the post-create cover picker is open. */
  const [createDeckHold, setCreateDeckHold] = useState(false);
  /** Deck already created in this flow; later Continues patch instead of re-create. */
  const [createFlowDeck, setCreateFlowDeck] = useState<Deck | null>(null);
  const [knowledge, setKnowledge] = useState<SubjectKnowledge | null>(null);
  const guest = isGuest();
  const { end: endLoad } = useTrackedOp("Loading subject…", {
    trackOnMount: true,
  });
  const { busy: exportBusy, run: runExport } = useTrackedOp(
    ANKI_EXPORT_BUSY_LABEL,
  );

  const load = useCallback(async () => {
    const [subjects, deckList, coverList, knowledgeResult, jobs] =
      await Promise.all([
        listSubjects(),
        listDecks(subjectId),
        guest
          ? Promise.resolve([] as StoredCoverRow[])
          : listCovers().catch(() => [] as StoredCoverRow[]),
        subjectComposition(subjectId).catch(() => null),
        guest
          ? Promise.resolve([] as JobListItem[])
          : listJobsWithDrafts().catch(() => [] as JobListItem[]),
      ]);
    const found = subjects.find((s) => s.id === subjectId) ?? null;
    setSubject(found);
    setDecks(deckList);
    setCovers(coverList);
    setKnowledge(knowledgeResult);
    setDraftJobs(jobs);
    return found;
  }, [guest, subjectId]);

  const syncSubjectFromList = useCallback(async () => {
    const subjects = await listSubjects();
    const found = subjects.find((s) => s.id === subjectId) ?? null;
    setSubject(found);
    return found;
  }, [subjectId]);

  const refreshKnowledge = useCallback(async () => {
    try {
      setKnowledge(await subjectComposition(subjectId));
    } catch {
      // Soft-fail: keep prior bar rather than blanking the page.
    }
  }, [subjectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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

  async function onClearCover() {
    if (!coverPicker) return;
    const { ownerKind, ownerId } = coverPicker;
    await clearCover(ownerKind, ownerId);
    setCovers((prev) =>
      prev.filter(
        (cover) => cover.ownerKind !== ownerKind || cover.ownerId !== ownerId,
      ),
    );
    if (createDeckHold) {
      finishCreateDeck(ownerId);
      return;
    }
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
    setCreateDeckHold(false);
    setCreateFlowDeck(null);
    setTitleDialog({ kind: "deck-create" });
  }

  function cancelCreateDeck() {
    setTitleDialog(null);
    setCreateDeckHold(false);
    setCoverPicker(null);
    setCreateFlowDeck(null);
    setDialogError(null);
  }

  function backFromCreateDeckCover() {
    if (!createFlowDeck) {
      cancelCreateDeck();
      return;
    }
    setDialogError(null);
    setTitleValue(createFlowDeck.title);
    setCoverPicker(null);
    setCreateDeckHold(false);
    setTitleDialog({ kind: "deck-create" });
  }

  function finishCreateDeck(deckId: string) {
    setTitleDialog(null);
    setCoverPicker(null);
    setCreateDeckHold(false);
    setCreateFlowDeck(null);
    setDialogError(null);
    navigate(`/library/decks/${encodeURIComponent(deckId)}`);
  }

  function closeCreateDeckCover() {
    const createdId = createFlowDeck?.id ?? null;
    setCoverPicker(null);
    setCreateDeckHold(false);
    setCreateFlowDeck(null);
    if (createdId) {
      navigate(`/library/decks/${encodeURIComponent(createdId)}`);
    }
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
      if (titleDialog.kind === "deck-create") {
        const saved = createFlowDeck
          ? await patchDeck(createFlowDeck.id, titleValue.trim())
          : await createDeck(titleValue.trim(), subjectId);
        if (createFlowDeck) {
          setDecks((prev) => prev.map((d) => (d.id === saved.id ? saved : d)));
        } else {
          setDecks((prev) => [...prev, saved]);
          await syncSubjectFromList();
        }
        setCreateFlowDeck(saved);
        setTitleValue(saved.title);
        if (!guest) {
          setCreateDeckHold(true);
          setCoverPicker({
            ownerKind: "deck",
            ownerId: saved.id,
            title: saved.title,
          });
          setTitleDialog(null);
        } else {
          finishCreateDeck(saved.id);
        }
        return;
      }

      let saved: CoverTarget;
      if (titleDialog.kind === "subject") {
        const updated = await patchSubject(subjectId, titleValue.trim());
        setSubject((prev) => (prev ? { ...prev, ...updated } : updated));
        saved = {
          ownerKind: "subject",
          ownerId: updated.id,
          title: updated.title,
        };
      } else {
        const updated = await patchDeck(titleDialog.deck.id, titleValue.trim());
        setDecks((prev) =>
          prev.map((d) => (d.id === updated.id ? updated : d)),
        );
        saved = {
          ownerKind: "deck",
          ownerId: updated.id,
          title: updated.title,
        };
      }
      setTitleDialog(null);
      if (!guest) setCoverPicker(saved);
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
      await refreshKnowledge();
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
  const subjectCover = subject
    ? covers.find((c) => c.ownerKind === "subject" && c.ownerId === subject.id)
    : undefined;
  const titleDialogChrome =
    titleDialog?.kind === "subject"
      ? {
          overline: "Rename",
          title: "Update the subject name",
          blurb: "Shown on the Library cover and in menus.",
          label: "Subject name",
          placeholder: "e.g. Anatomy",
          submit: "Save",
          busy: "Saving…",
        }
      : titleDialog?.kind === "deck-rename"
        ? {
            overline: "Rename",
            title: "Update the deck name",
            blurb: "Shown on the hub header and in your Library.",
            label: "Deck name",
            placeholder: "e.g. Upper limb",
            submit: "Save",
            busy: "Saving…",
          }
        : null;

  const menuDeck = pageMenu?.deck ?? null;
  const creatingDeck = titleDialog?.kind === "deck-create" || createDeckHold;
  const renameDialogOpen =
    titleDialog?.kind === "subject" || titleDialog?.kind === "deck-rename";

  function openCoverPicker() {
    if (!subject || guest) return;
    setCoverPicker({
      ownerKind: "subject",
      ownerId: subject.id,
      title: subject.title,
    });
  }

  return (
    <Container
      maxWidth="md"
      sx={{
        py: { xs: 2, md: 3 },
        display: "flex",
        flexDirection: "column",
        minHeight: { md: "100%" },
        flex: 1,
      }}
    >
      {!ready ? (
        <Stack spacing={2}>
          <Skeleton variant="text" width={80} />
          <Skeleton variant="text" width={200} height={40} />
          <LibraryBoard aria-label="Loading decks">
            {[0, 1, 2, 3].map((key) => (
              <Box key={key} component="li" sx={{ listStyle: "none" }}>
                <Skeleton
                  variant="rounded"
                  height={160}
                  sx={{ borderRadius: 2 }}
                />
              </Box>
            ))}
          </LibraryBoard>
        </Stack>
      ) : (
        <Stack spacing={creatingDeck ? 0 : 2} sx={{ flex: 1, minHeight: 0 }}>
          {creatingDeck ? null : (
            <Box
              sx={{
                flexShrink: 0,
                pb: 1.5,
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <StageBreadcrumbs
                crumbs={[{ label: "Library", href: "/library" }]}
                sx={{ mb: 1.5 }}
              />
              <Stack
                direction="row"
                alignItems="flex-start"
                justifyContent="space-between"
                spacing={2}
              >
                <Stack
                  direction="row"
                  spacing={{ xs: 2, sm: 2.5 }}
                  alignItems="flex-start"
                  sx={{ flex: 1, minWidth: 0 }}
                >
                  <Stack
                    spacing={0.75}
                    alignItems="stretch"
                    sx={{ flexShrink: 0, width: { xs: 104, sm: 132 } }}
                  >
                    <Box
                      component={!guest && subject ? ButtonBase : "div"}
                      {...(!guest && subject
                        ? {
                            focusRipple: true,
                            onClick: openCoverPicker,
                            "aria-label": subjectCover
                              ? `Change cover for ${subject.title}`
                              : `Add cover for ${subject.title}`,
                          }
                        : {})}
                      sx={{
                        position: "relative",
                        width: "100%",
                        aspectRatio: "3 / 4",
                        borderRadius: 2,
                        overflow: "hidden",
                        border: 1,
                        borderColor: "rgba(232, 216, 199, 0.16)",
                        bgcolor: coverPlaceholderColor(
                          subject?.id ?? subjectId,
                        ),
                        boxShadow: "0 14px 36px rgba(0,0,0,0.42)",
                        textAlign: "left",
                        display: "block",
                        transition:
                          "transform 180ms ease, box-shadow 180ms ease",
                        "@media (prefers-reduced-motion: reduce)": {
                          transition: "none",
                        },
                        ...(!guest && subject
                          ? {
                              "&:hover, &:focus-visible": {
                                transform: "translateY(-2px) scale(1.02)",
                                boxShadow: "0 18px 44px rgba(0,0,0,0.5)",
                              },
                              "@media (prefers-reduced-motion: reduce)": {
                                "&:hover, &:focus-visible": {
                                  transform: "none",
                                },
                              },
                            }
                          : {}),
                      }}
                    >
                      {subjectCover?.imageUrl ? (
                        <Box
                          component="img"
                          src={subjectCover.imageUrl}
                          alt=""
                          sx={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      ) : null}
                      <Box
                        aria-hidden
                        sx={{
                          position: "absolute",
                          inset: 0,
                          background:
                            "linear-gradient(180deg, transparent 42%, rgba(15, 5, 14, 0.82) 100%)",
                          pointerEvents: "none",
                        }}
                      />
                    </Box>
                  </Stack>
                  <Box sx={{ minWidth: 0, flex: 1, pt: { xs: 0.25, sm: 0.5 } }}>
                    <Stack
                      direction="row"
                      alignItems="flex-start"
                      justifyContent="space-between"
                      spacing={1}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          component="p"
                          sx={{
                            m: 0,
                            mb: 0.75,
                            fontSize: "0.6875rem",
                            fontWeight: 500,
                            letterSpacing: "0.22em",
                            textTransform: "uppercase",
                            color: "primary.main",
                          }}
                        >
                          Subject
                        </Typography>
                        <Typography
                          variant="h3"
                          component="h1"
                          sx={{
                            m: 0,
                            fontFamily:
                              '"Alice", "Georgia", "Times New Roman", serif',
                            fontWeight: 400,
                            letterSpacing: "0.02em",
                            lineHeight: 1.1,
                            color: "text.primary",
                          }}
                        >
                          {subject?.title ?? "Subject"}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.75 }}
                        >
                          {decks.length === 0
                            ? "No decks yet"
                            : decks.length === 1
                              ? "1 deck"
                              : `${decks.length} decks`}
                        </Typography>
                      </Box>
                      {subject ? (
                        <Stack
                          direction="row"
                          spacing={0.25}
                          flexShrink={0}
                          sx={{ mt: -0.25 }}
                        >
                          <Tooltip title="Rename subject">
                            <IconButton
                              size="small"
                              aria-label={`Rename ${subject.title}`}
                              onClick={openRenameSubject}
                              sx={{ color: "text.secondary" }}
                            >
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {!guest ? (
                            <Tooltip
                              title={
                                subjectCover ? "Change cover" : "Add cover"
                              }
                            >
                              <IconButton
                                size="small"
                                aria-label={
                                  subjectCover
                                    ? `Change cover for ${subject.title}`
                                    : `Add cover for ${subject.title}`
                                }
                                onClick={openCoverPicker}
                                sx={{ color: "text.secondary" }}
                              >
                                <ImageOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : null}
                          {deleteSubjectBlocked ? (
                            <Tooltip title="Remove decks before deleting this subject">
                              <span>
                                <IconButton
                                  size="small"
                                  aria-label={`Delete ${subject.title}`}
                                  disabled
                                  sx={{ color: "text.secondary" }}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Delete subject">
                              <IconButton
                                size="small"
                                aria-label={`Delete ${subject.title}`}
                                onClick={requestDeleteSubject}
                                sx={{ color: "text.secondary" }}
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {!guest && decks.length > 0 ? (
                            <Tooltip
                              title={
                                exportBusy ? "Exporting…" : "Download for Anki"
                              }
                            >
                              <span>
                                <IconButton
                                  size="small"
                                  aria-label={`Download ${subject.title} for Anki`}
                                  disabled={exportBusy}
                                  onClick={() => {
                                    void onExportAnki();
                                  }}
                                  sx={{ color: "text.secondary" }}
                                >
                                  <FileDownloadOutlinedIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          ) : null}
                        </Stack>
                      ) : null}
                    </Stack>
                    {knowledge ? (
                      <Box sx={{ mt: 1.5 }}>
                        <SubjectKnowledgeBar knowledge={knowledge} />
                      </Box>
                    ) : null}
                  </Box>
                </Stack>
              </Stack>
            </Box>
          )}

          {creatingDeck ? null : error ? (
            <Alert severity="error">{error}</Alert>
          ) : null}
          {creatingDeck ? null : notice ? (
            <Alert severity="success" onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          ) : null}
          {creatingDeck ? null : exportWarning ? (
            <Alert severity="warning" onClose={() => setExportWarning(null)}>
              {exportWarning}
            </Alert>
          ) : null}

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {creatingDeck ? (
              <Box
                key="create-deck"
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  animation: "subjectCreateIn 320ms cubic-bezier(0.2, 0, 0, 1)",
                  "@keyframes subjectCreateIn": {
                    from: { opacity: 0, transform: "translateX(40px)" },
                    to: { opacity: 1, transform: "translateX(0)" },
                  },
                  "@media (prefers-reduced-motion: reduce)": {
                    animation: "none",
                  },
                }}
              >
                {titleDialog?.kind === "deck-create" ? (
                  <LibraryCreateSubjectPanel
                    guest={guest}
                    titleValue={titleValue}
                    setTitleValue={setTitleValue}
                    busy={dialogBusy}
                    error={dialogError}
                    onSubmit={onTitleDialogSubmit}
                    onCancel={cancelCreateDeck}
                    overline="New deck"
                    heading="Name this deck"
                    blurb={
                      guest
                        ? "Opens in the deck hub so you can add material next."
                        : "Next you will pick a cover photo, then open the hub."
                    }
                    fieldLabel="Deck name"
                    placeholder="e.g. Upper limb"
                  />
                ) : coverPicker ? (
                  <CoverPickerPanel
                    active
                    inlineChrome
                    title={coverPicker.title}
                    ownerKind={coverPicker.ownerKind}
                    ownerId={coverPicker.ownerId}
                    onSaved={(row) => {
                      setCovers((prev) => [
                        row,
                        ...prev.filter(
                          (cover) =>
                            cover.ownerKind !== row.ownerKind ||
                            cover.ownerId !== row.ownerId,
                        ),
                      ]);
                      closeCreateDeckCover();
                    }}
                    onClear={onClearCover}
                    onCancel={closeCreateDeckCover}
                    onBack={backFromCreateDeckCover}
                  />
                ) : null}
              </Box>
            ) : decks.length === 0 ? (
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Box
                  sx={{
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2.5,
                    py: 2,
                  }}
                >
                  <Box
                    sx={{
                      textAlign: "center",
                      px: 2,
                      maxWidth: 420,
                    }}
                  >
                    <Typography
                      component="p"
                      sx={{
                        m: 0,
                        mb: 0.75,
                        fontSize: "0.6875rem",
                        fontWeight: 500,
                        letterSpacing: "0.22em",
                        textTransform: "uppercase",
                        color: "primary.main",
                      }}
                    >
                      Get started
                    </Typography>
                    <Typography
                      variant="h5"
                      component="p"
                      sx={{
                        m: 0,
                        fontFamily:
                          '"Alice", "Georgia", "Times New Roman", serif',
                        fontWeight: 400,
                        letterSpacing: "0.02em",
                        lineHeight: 1.2,
                        color: "text.primary",
                      }}
                    >
                      Add your first deck
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 1, lineHeight: 1.5 }}
                    >
                      Decks hold the cards for one topic inside this subject.
                      Name one, pick a cover, then add material in the hub.
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      width: "100%",
                      maxWidth: { xs: 168, sm: 180, md: 200 },
                    }}
                  >
                    <LibraryBoard aria-label="Decks">
                      <Box
                        component="li"
                        sx={{ listStyle: "none", m: 0, p: 0, minHeight: 0 }}
                      >
                        <BoardTile
                          index={0}
                          title="New deck"
                          meta="Name it, then open the hub"
                          create
                          accent
                          onCreate={openCreateDeck}
                          openLabel="New deck"
                        />
                      </Box>
                    </LibraryBoard>
                  </Box>
                </Box>
              </Box>
            ) : (
              <LibraryBoard aria-label="Decks">
                {decks.map((d, index) => {
                  const href = `/library/decks/${encodeURIComponent(d.id)}`;
                  const cover = covers.find(
                    (c) => c.ownerKind === "deck" && c.ownerId === d.id,
                  );
                  const draftCount = draftJobs
                    .filter((job) => job.deck_id === d.id)
                    .reduce((sum, job) => sum + job.draft_count, 0);
                  const reviewNotice =
                    draftCount <= 0
                      ? null
                      : draftCount === 1
                        ? "1 to check"
                        : `${draftCount} to check`;
                  return (
                    <Box
                      key={d.id}
                      component="li"
                      sx={{ listStyle: "none", m: 0, p: 0, minHeight: 0 }}
                    >
                      <BoardTile
                        index={index}
                        title={d.title}
                        meta="Open hub to author"
                        imageSrc={cover?.imageUrl}
                        placeholderColor={coverPlaceholderColor(d.id)}
                        href={href}
                        openLabel={
                          reviewNotice
                            ? `Open hub for ${d.title}, ${reviewNotice}`
                            : `Open hub for ${d.title}`
                        }
                        notice={reviewNotice}
                        moreLabel={`More actions for ${d.title}`}
                        onMore={(ev) =>
                          setPageMenu({
                            anchor: ev.currentTarget,
                            deck: d,
                          })
                        }
                      />
                    </Box>
                  );
                })}
                <Box component="li" sx={{ listStyle: "none", m: 0, p: 0 }}>
                  <BoardTile
                    index={decks.length}
                    title="New deck"
                    meta="Add to this subject"
                    create
                    onCreate={openCreateDeck}
                    openLabel="New deck"
                  />
                </Box>
              </LibraryBoard>
            )}
          </Box>
        </Stack>
      )}

      <Dialog
        open={renameDialogOpen}
        onClose={() => !dialogBusy && setTitleDialog(null)}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "background.paper",
          },
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
            <Typography
              component="p"
              sx={{
                m: 0,
                mb: 0.75,
                fontSize: "0.6875rem",
                fontWeight: 500,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "primary.main",
              }}
            >
              {titleDialogChrome?.overline ?? ""}
            </Typography>
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
              {titleDialogChrome?.title ?? ""}
            </DialogTitle>
            {titleDialogChrome?.blurb ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 1, maxWidth: "36ch" }}
              >
                {titleDialogChrome.blurb}
              </Typography>
            ) : null}
          </Box>
          <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
            {dialogError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {dialogError}
              </Alert>
            ) : null}
            <TextField
              autoFocus
              margin="none"
              label={titleDialogChrome?.label ?? "Name"}
              placeholder={titleDialogChrome?.placeholder}
              value={titleValue}
              onChange={(ev) => setTitleValue(ev.target.value)}
              required
              fullWidth
              inputProps={{
                maxLength: 80,
                "aria-label": titleDialogChrome?.label ?? "Name",
              }}
              helperText={`${titleValue.trim().length}/80`}
              FormHelperTextProps={{ sx: { textAlign: "right", mx: 0 } }}
            />
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
              {dialogBusy
                ? (titleDialogChrome?.busy ?? "Saving…")
                : (titleDialogChrome?.submit ?? "Save")}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={confirmSubjectDelete}
        onClose={() => !subjectDeleteBusy && setConfirmSubjectDelete(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "background.paper",
          },
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
          <Typography
            component="p"
            sx={{
              m: 0,
              mb: 0.75,
              fontSize: "0.6875rem",
              fontWeight: 500,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "error.main",
            }}
          >
            Delete
          </Typography>
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
            {subject ? (
              <>
                Delete{" "}
                <Box component="strong" sx={{ color: "text.primary" }}>
                  {subject.title}
                </Box>
                ? This only works when the subject has no decks.
              </>
            ) : null}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setConfirmSubjectDelete(false)}
            disabled={subjectDeleteBusy}
            sx={{ color: "text.secondary" }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={subjectDeleteBusy}
            onClick={confirmDeleteSubject}
            sx={{ minWidth: 112 }}
          >
            {subjectDeleteBusy ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "background.paper",
          },
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
          <Typography
            component="p"
            sx={{
              m: 0,
              mb: 0.75,
              fontSize: "0.6875rem",
              fontWeight: 500,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "error.main",
            }}
          >
            Delete
          </Typography>
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
            Remove this deck?
          </DialogTitle>
        </Box>
        <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
          <DialogContentText sx={{ color: "text.secondary" }}>
            {deleteTarget && deleteStats ? (
              <>
                Delete{" "}
                <Box component="strong" sx={{ color: "text.primary" }}>
                  {deleteTarget.title}
                </Box>
                ? This removes {deleteStats.accepted} accepted card
                {deleteStats.accepted === 1 ? "" : "s"}, {deleteStats.draft}{" "}
                draft{deleteStats.draft === 1 ? "" : "s"},{" "}
                {deleteStats.archived} archived card
                {deleteStats.archived === 1 ? "" : "s"}, and{" "}
                {deleteStats.materials} material
                {deleteStats.materials === 1 ? "" : "s"}.
              </>
            ) : deleteTarget ? (
              <>Loading counts for {deleteTarget.title}…</>
            ) : null}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={deleteBusy}
            sx={{ color: "text.secondary" }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteBusy || !deleteStats}
            onClick={confirmDeleteDeck}
            sx={{ minWidth: 112 }}
          >
            {deleteBusy ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Menu
        anchorEl={pageMenu?.anchor ?? null}
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

      {guest || createDeckHold ? null : (
        <CoverPickerDialog
          open={coverPicker !== null}
          title={coverPicker?.title ?? ""}
          ownerKind={coverPicker?.ownerKind ?? "deck"}
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
    </Container>
  );
}
