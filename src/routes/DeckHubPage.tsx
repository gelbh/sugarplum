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
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  ApiError,
  createDeckCard,
  deckStats,
  deleteDeck,
  listDeckCards,
  listDecks,
  listJobsWithDrafts,
  listSubjects,
  me,
  pasteMaterial,
  patchCard,
  patchDeck,
  PPTX_MIME,
  resetCardSchedule,
  resolveUploadContentType,
  uploadMaterialFile,
  uploadPdfWithFigureCrops,
  type CardDraftView,
  type CardType,
  type Deck,
  type DeckStats,
  type JobListItem,
  type Subject,
} from "../api/client";
import DraftCardEditor, {
  type DraftEditorChange,
} from "../components/DraftCardEditor";
import { FigureSuggestPanel } from "../components/FigureSuggestPanel";
import { isGuest } from "../guest/session";
import { guestPasteToCards } from "../guest/pasteToCards";
import { guestAddAcceptedCards } from "../guest/store";
import { CLOZE_EXTRA_LABEL } from "../lib/clozeFormat";
import { MAX_CLIENT_FIGURES } from "../lib/figureGeometry";
import { navigate } from "../nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";

type Props = {
  deckId: string;
};

type HubCardType = "qa" | "cloze" | "mcq";

const MCQ_MIN = 3;
const MCQ_MAX = 5;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_UPLOAD_MIMES = new Set([
  "application/pdf",
  PPTX_MIME,
  ...IMAGE_MIMES,
]);

function cardFrontPreview(card: CardDraftView): string {
  if (typeof card.front === "string") return card.front;
  if (
    typeof card.front === "object" &&
    card.front !== null &&
    "prompt" in card.front &&
    typeof card.front.prompt === "string" &&
    card.front.prompt.trim()
  ) {
    return card.front.prompt;
  }
  return card.type === "occlusion" ? "Occlusion card" : "Card";
}

function cardTypeLabel(type: CardDraftView["type"]): string {
  if (type === "cloze") return "Cloze";
  if (type === "mcq") return "MCQ";
  if (type === "occlusion") return "Occlusion";
  if (type === "image_label") return "Image label";
  if (type === "diagram") return "Diagram";
  return "Q&A";
}

function cardPatchBody(card: CardDraftView): Parameters<typeof patchCard>[1] {
  const type = card.type as CardType;
  const body: Parameters<typeof patchCard>[1] = {
    front: card.front,
    back: card.back,
    type,
  };
  if (type === "mcq" && card.options) {
    body.options = card.options;
  }
  return body;
}

export default function DeckHubPage({ deckId }: Props) {
  const guest = isGuest();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [cards, setCards] = useState<CardDraftView[]>([]);
  const [draftJobs, setDraftJobs] = useState<JobListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteStats, setDeleteStats] = useState<DeckStats | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [editCard, setEditCard] = useState<CardDraftView | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const [createType, setCreateType] = useState<HubCardType>("qa");
  const [createFront, setCreateFront] = useState("");
  const [createBack, setCreateBack] = useState("");
  const [createOptions, setCreateOptions] = useState(["", "", ""]);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [materialTab, setMaterialTab] = useState<"paste" | "file">("paste");
  const [pasteText, setPasteText] = useState("");
  const [pasteFilename, setPasteFilename] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [figureFiles, setFigureFiles] = useState<File[]>([]);
  const [materialBusy, setMaterialBusy] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [materialNotice, setMaterialNotice] = useState<string | null>(null);

  const { end: endLoad } = useTrackedOp("Loading deck…", {
    trackOnMount: true,
  });

  const refreshCards = useCallback(async () => {
    setCards(await listDeckCards(deckId));
  }, [deckId]);

  const refreshDraftJobs = useCallback(async () => {
    if (guest) {
      setDraftJobs([]);
      return;
    }
    try {
      const jobs = await listJobsWithDrafts();
      setDraftJobs(jobs.filter((j) => j.deck_id === deckId));
    } catch {
      setDraftJobs([]);
    }
  }, [deckId, guest]);

  const load = useCallback(async () => {
    const [deckList, subjects] = await Promise.all([
      listDecks(),
      listSubjects(),
    ]);
    const found = deckList.find((d) => d.id === deckId) ?? null;
    setDeck(found);
    setSubject(
      found
        ? (subjects.find((s) => s.id === found.subject_id) ?? null)
        : null,
    );
    if (found) {
      await Promise.all([refreshCards(), refreshDraftJobs()]);
    }
    return found;
  }, [deckId, refreshCards, refreshDraftJobs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        const found = await load();
        if (cancelled) return;
        if (!found) setError("Deck not found");
        setReady(true);
        endLoad();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load deck");
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad, load]);

  async function onRenameSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!deck || !renameValue.trim()) return;
    setRenameBusy(true);
    setRenameError(null);
    try {
      const updated = await patchDeck(deck.id, renameValue.trim());
      setDeck(updated);
      setRenameOpen(false);
    } catch (err) {
      setRenameError(err instanceof ApiError ? err.message : "Could not rename");
    } finally {
      setRenameBusy(false);
    }
  }

  async function openDelete() {
    if (!deck) return;
    setError(null);
    setConfirmDelete(true);
    setDeleteStats(null);
    try {
      setDeleteStats(await deckStats(deck.id));
    } catch (err) {
      setConfirmDelete(false);
      setError(
        err instanceof ApiError ? err.message : "Could not load deck stats",
      );
    }
  }

  async function confirmDeleteDeck() {
    if (!deck) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await deleteDeck(deck.id);
      const subjectPath = subject
        ? `/library/subjects/${encodeURIComponent(subject.id)}`
        : "/library";
      navigate(subjectPath);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete deck");
    } finally {
      setDeleteBusy(false);
    }
  }

  function openEdit(card: CardDraftView) {
    setEditError(null);
    setEditCard({ ...card, options: card.options ? [...card.options] : undefined });
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
    if (!editCard) return;
    setEditBusy(true);
    setEditError(null);
    try {
      const updated = await patchCard(editCard.id, cardPatchBody(editCard));
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditCard(null);
      setNotice("Card saved");
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Could not save card");
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmResetSchedule() {
    if (!editCard) return;
    setResetBusy(true);
    setEditError(null);
    try {
      const updated = await resetCardSchedule(editCard.id);
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditCard(updated);
      setConfirmReset(false);
      setNotice("Schedule reset");
    } catch (err) {
      setEditError(
        err instanceof ApiError ? err.message : "Could not reset schedule",
      );
    } finally {
      setResetBusy(false);
    }
  }

  function onCreateTypeChange(type: HubCardType) {
    setCreateType(type);
    setCreateError(null);
    if (type === "mcq") {
      const back = createBack.trim();
      setCreateOptions(
        back
          ? [back, "", ""].slice(0, MCQ_MIN)
          : ["", "", ""],
      );
    }
  }

  function updateCreateOption(index: number, value: string) {
    const wasCorrect = createBack === createOptions[index];
    setCreateOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (wasCorrect) setCreateBack(value);
  }

  async function onCreateCard(e?: FormEvent) {
    e?.preventDefault();
    setCreateError(null);
    const front = createFront.trim();
    if (!front) {
      setCreateError("Front is required");
      return;
    }
    let back = createBack.trim();
    let options: string[] | undefined;
    if (createType === "mcq") {
      options = createOptions.map((o) => o.trim()).filter(Boolean);
      if (options.length < MCQ_MIN) {
        setCreateError(`MCQ needs at least ${MCQ_MIN} choices`);
        return;
      }
      if (!back || !options.includes(back)) {
        setCreateError("Pick the correct choice");
        return;
      }
    } else if (createType === "qa" && !back) {
      setCreateError("Back is required");
      return;
    }
    setCreateBusy(true);
    try {
      const created = await createDeckCard(deckId, {
        type: createType,
        front,
        back: createType === "cloze" ? createBack.trim() : back,
        ...(options ? { options } : {}),
      });
      setCards((prev) => [created, ...prev]);
      setCreateFront("");
      setCreateBack("");
      setCreateOptions(["", "", ""]);
      setCreateType("qa");
      setNotice("Card added");
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Could not create card",
      );
    } finally {
      setCreateBusy(false);
    }
  }

  async function onGuestPaste(e?: FormEvent) {
    e?.preventDefault();
    setMaterialError(null);
    setMaterialNotice(null);
    const { cards: pairs, truncated } = guestPasteToCards(pasteText);
    if (pairs.length === 0) {
      setMaterialError(
        "Paste needs clearer paragraphs or Q&A lines (blank line between cards).",
      );
      return;
    }
    setMaterialBusy(true);
    try {
      const added = guestAddAcceptedCards(deckId, pairs);
      if (added.length === 0) {
        setMaterialError("Could not save. Try again.");
        return;
      }
      setPasteText("");
      await refreshCards();
      const truncNote = truncated
        ? ` (kept first ${added.length}; paste was longer than the 40-card limit)`
        : "";
      setMaterialNotice(
        `Added ${added.length} local cards${truncNote}`,
      );
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" || err.code === 22)
      ) {
        setMaterialError(
          "Browser storage is full. Shorten the paste or clear guest data, then try again.",
        );
      } else {
        setMaterialError("Could not save local cards");
      }
    } finally {
      setMaterialBusy(false);
    }
  }

  async function onAccountPaste(e?: FormEvent) {
    e?.preventDefault();
    setMaterialError(null);
    setMaterialNotice(null);
    if (!pasteText.trim()) {
      setMaterialError("Paste some text first");
      return;
    }
    setMaterialBusy(true);
    try {
      const material = await pasteMaterial(deckId, {
        text: pasteText,
        ...(pasteFilename.trim() ? { filename: pasteFilename.trim() } : {}),
      });
      setPasteText("");
      setPasteFilename("");
      if (material.jobId) {
        window.location.assign(
          `/jobs/${encodeURIComponent(material.jobId)}/drafts`,
        );
        return;
      }
      setMaterialNotice(`Saved paste material (${material.status})`);
      await refreshDraftJobs();
    } catch (err) {
      setMaterialError(
        err instanceof ApiError ? err.message : "Could not save paste",
      );
    } finally {
      setMaterialBusy(false);
    }
  }

  async function onUploadFile(e?: FormEvent) {
    e?.preventDefault();
    setMaterialError(null);
    setMaterialNotice(null);
    if (!uploadFile) {
      setMaterialError("Choose a PDF, PPTX, or image file");
      return;
    }
    const contentType = resolveUploadContentType(uploadFile);
    if (!ALLOWED_UPLOAD_MIMES.has(contentType)) {
      setMaterialError("Only PDF, PPTX, or image (jpeg/png/webp) files are allowed");
      return;
    }
    if (uploadFile.size > MAX_FILE_BYTES) {
      setMaterialError("File must be 25MB or smaller");
      return;
    }
    if (IMAGE_MIMES.has(contentType) && uploadFile.size > MAX_IMAGE_BYTES) {
      setMaterialError("Images for generation must be 8MB or smaller");
      return;
    }
    if (figureFiles.length > MAX_CLIENT_FIGURES) {
      setMaterialError(`Attach at most ${MAX_CLIENT_FIGURES} figure crops`);
      return;
    }
    for (const figure of figureFiles) {
      if (resolveUploadContentType(figure) !== "image/png") {
        setMaterialError("Figure crops must be PNG images");
        return;
      }
      if (figure.size > MAX_IMAGE_BYTES) {
        setMaterialError("Figure crops must be 8MB or smaller");
        return;
      }
    }
    setMaterialBusy(true);
    try {
      const material =
        contentType === "application/pdf" && figureFiles.length > 0
          ? await uploadPdfWithFigureCrops(deckId, uploadFile, figureFiles)
          : await uploadMaterialFile(deckId, uploadFile);
      setUploadFile(null);
      setFigureFiles([]);
      if (material.jobId) {
        setMaterialNotice(
          `Stored file (${material.status}). Generation started.`,
        );
        window.location.assign(
          `/jobs/${encodeURIComponent(material.jobId)}/drafts`,
        );
        return;
      }
      setMaterialNotice(`Stored file (${material.status}).`);
      await refreshDraftJobs();
    } catch (err) {
      setMaterialError(
        err instanceof ApiError ? err.message : "Could not upload file",
      );
    } finally {
      setMaterialBusy(false);
    }
  }

  const subjectHref = subject
    ? `/library/subjects/${encodeURIComponent(subject.id)}`
    : "/library";

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 5 } }}>
      {!ready ? (
        <Typography color="text.secondary">Loading deck…</Typography>
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
              {subject ? (
                <>
                  {" / "}
                  <Link
                    href={subjectHref}
                    underline="hover"
                    color="primary"
                    onClick={(ev) => {
                      ev.preventDefault();
                      navigate(subjectHref);
                    }}
                  >
                    {subject.title}
                  </Link>
                </>
              ) : null}
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
                {deck?.title ?? "Deck"}
              </Typography>
              {deck ? (
                <Stack direction="row" spacing={0.5}>
                  <IconButton
                    size="small"
                    aria-label="Rename deck"
                    onClick={() => {
                      setRenameError(null);
                      setRenameValue(deck.title);
                      setRenameOpen(true);
                    }}
                  >
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label="Delete deck"
                    onClick={openDelete}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ) : null}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Cards, materials, and drafts for this deck.
            </Typography>
          </Box>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {notice ? (
            <Alert severity="success" onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          ) : null}

          {deck ? (
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                bgcolor: "background.paper",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
              >
                Add material
              </Typography>
              {materialError ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {materialError}
                </Alert>
              ) : null}
              {materialNotice ? (
                <Alert severity="success" sx={{ mb: 2 }}>
                  {materialNotice}
                </Alert>
              ) : null}
              {guest ? (
                <Stack spacing={2}>
                  <Alert severity="info">
                    Cards stay in this browser only. Sign in for uploads and AI
                    generation.
                  </Alert>
                  <Box component="form" onSubmit={onGuestPaste} noValidate>
                    <Stack spacing={2}>
                      <TextField
                        label="Paste text"
                        value={pasteText}
                        onChange={(ev) => setPasteText(ev.target.value)}
                        required
                        fullWidth
                        multiline
                        minRows={5}
                      />
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={materialBusy || !pasteText.trim()}
                      >
                        {materialBusy ? "Saving…" : "Save paste"}
                      </Button>
                    </Stack>
                  </Box>
                </Stack>
              ) : (
                <Box>
                  <Tabs
                    value={materialTab}
                    onChange={(_ev, v: "paste" | "file") => setMaterialTab(v)}
                    aria-label="material-type-tabs"
                    sx={{ mb: 2 }}
                  >
                    <Tab value="paste" label="Paste" />
                    <Tab value="file" label="Upload" />
                  </Tabs>
                  {materialTab === "paste" ? (
                    <Box component="form" onSubmit={onAccountPaste} noValidate>
                      <Stack spacing={2}>
                        <TextField
                          label="Filename (optional)"
                          value={pasteFilename}
                          onChange={(ev) => setPasteFilename(ev.target.value)}
                          fullWidth
                        />
                        <TextField
                          label="Paste text"
                          value={pasteText}
                          onChange={(ev) => setPasteText(ev.target.value)}
                          required
                          fullWidth
                          multiline
                          minRows={5}
                        />
                        <Button
                          type="submit"
                          variant="contained"
                          disabled={materialBusy || !pasteText.trim()}
                        >
                          {materialBusy ? "Saving…" : "Save paste"}
                        </Button>
                      </Stack>
                    </Box>
                  ) : (
                    <Box component="form" onSubmit={onUploadFile} noValidate>
                      <Stack spacing={2}>
                        <Button
                          variant="outlined"
                          component="label"
                          disabled={materialBusy}
                        >
                          {uploadFile
                            ? uploadFile.name
                            : "Choose PDF, PPTX, or image"}
                          <input
                            type="file"
                            accept="application/pdf,.pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                            hidden
                            onChange={(ev) => {
                              const file = ev.target.files?.[0] ?? null;
                              setUploadFile(file);
                              if (
                                !file ||
                                resolveUploadContentType(file) !==
                                  "application/pdf"
                              ) {
                                setFigureFiles([]);
                              }
                            }}
                          />
                        </Button>
                        {uploadFile &&
                        resolveUploadContentType(uploadFile) ===
                          "application/pdf" ? (
                          <Stack spacing={1.5}>
                            <FigureSuggestPanel
                              pdfFile={uploadFile}
                              disabled={materialBusy}
                              crops={figureFiles}
                              onCropsChange={setFigureFiles}
                            />
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Optional: Suggest or drag-crop figures on-device.
                              Accept appends up to {MAX_CLIENT_FIGURES} PNG
                              crops.
                            </Typography>
                          </Stack>
                        ) : null}
                        <Button
                          type="submit"
                          variant="contained"
                          disabled={materialBusy || !uploadFile}
                        >
                          {materialBusy ? "Uploading…" : "Upload"}
                        </Button>
                      </Stack>
                    </Box>
                  )}
                </Box>
              )}
            </Paper>
          ) : null}

          {!guest && draftJobs.length > 0 ? (
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                bgcolor: "background.paper",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
              >
                Drafts for this deck
              </Typography>
              <Stack
                component="ul"
                spacing={0}
                divider={<Divider flexItem />}
                sx={{ m: 0, p: 0, listStyle: "none" }}
              >
                {draftJobs.map((job) => (
                  <Box
                    component="li"
                    key={job.id}
                    sx={{ py: 1 }}
                  >
                    <Link
                      href={`/jobs/${encodeURIComponent(job.id)}/drafts`}
                      underline="hover"
                      color="primary"
                      variant="body2"
                      onClick={(ev) => {
                        ev.preventDefault();
                        navigate(
                          `/jobs/${encodeURIComponent(job.id)}/drafts`,
                        );
                      }}
                    >
                      {job.filename?.trim() || "Untitled material"}
                      {" · "}
                      {job.draft_count} draft
                      {job.draft_count === 1 ? "" : "s"}
                    </Link>
                  </Box>
                ))}
              </Stack>
            </Paper>
          ) : null}

          {deck ? (
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                bgcolor: "background.paper",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
              >
                Cards
              </Typography>
              {cards.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No accepted cards yet. Add one below or paste material.
                </Typography>
              ) : (
                <Stack
                  component="ul"
                  spacing={0}
                  divider={<Divider flexItem />}
                  sx={{ m: 0, p: 0, listStyle: "none" }}
                >
                  {cards.map((card) => (
                    <Box
                      component="li"
                      key={card.id}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        py: 1,
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" noWrap>
                          {cardFrontPreview(card)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {cardTypeLabel(card.type)}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        aria-label="Edit card"
                        onClick={() => openEdit(card)}
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              )}
            </Paper>
          ) : null}

          {deck ? (
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                bgcolor: "background.paper",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
              >
                Add card
              </Typography>
              {createError ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {createError}
                </Alert>
              ) : null}
              <Box component="form" onSubmit={onCreateCard} noValidate>
                <Stack spacing={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="hub-create-type">Type</InputLabel>
                    <Select
                      labelId="hub-create-type"
                      label="Type"
                      value={createType}
                      onChange={(ev) =>
                        onCreateTypeChange(ev.target.value as HubCardType)
                      }
                    >
                      <MenuItem value="qa">Q&A</MenuItem>
                      <MenuItem value="cloze">Fill in the blank</MenuItem>
                      <MenuItem value="mcq">Multiple choice</MenuItem>
                    </Select>
                  </FormControl>
                  {createType === "cloze" ? (
                    <>
                      <TextField
                        label="Front (sentence with blank markup)"
                        value={createFront}
                        onChange={(ev) => setCreateFront(ev.target.value)}
                        multiline
                        minRows={2}
                        fullWidth
                        required
                        helperText="Use Anki-style {{c1::answer}} for the blank."
                      />
                      <TextField
                        label={CLOZE_EXTRA_LABEL}
                        value={createBack}
                        onChange={(ev) => setCreateBack(ev.target.value)}
                        multiline
                        minRows={2}
                        fullWidth
                      />
                    </>
                  ) : createType === "mcq" ? (
                    <>
                      <TextField
                        label="Question"
                        value={createFront}
                        onChange={(ev) => setCreateFront(ev.target.value)}
                        multiline
                        minRows={2}
                        fullWidth
                        required
                      />
                      <Typography variant="body2" fontWeight={500}>
                        Choices
                      </Typography>
                      <Stack spacing={1.5}>
                        {createOptions.map((option, index) => (
                          <Stack
                            key={index}
                            direction="row"
                            spacing={1}
                            alignItems="flex-start"
                          >
                            <FormControlLabel
                              sx={{ m: 0, flexShrink: 0, pt: 1 }}
                              control={
                                <Radio
                                  checked={createBack === option && option !== ""}
                                  onChange={() => setCreateBack(option)}
                                  inputProps={{
                                    "aria-label": `Correct choice ${index + 1}`,
                                  }}
                                />
                              }
                              label="Correct"
                            />
                            <TextField
                              label={`Choice ${index + 1}`}
                              value={option}
                              onChange={(ev) =>
                                updateCreateOption(index, ev.target.value)
                              }
                              fullWidth
                              size="small"
                            />
                            <Button
                              variant="text"
                              color="inherit"
                              size="small"
                              disabled={createOptions.length <= MCQ_MIN}
                              onClick={() => {
                                if (createOptions.length <= MCQ_MIN) return;
                                const removed = createOptions[index];
                                const next = createOptions.filter(
                                  (_, i) => i !== index,
                                );
                                setCreateOptions(next);
                                if (createBack === removed) {
                                  setCreateBack(
                                    next.find((o) => o.trim()) ?? next[0] ?? "",
                                  );
                                }
                              }}
                              sx={{ flexShrink: 0, mt: 0.5 }}
                            >
                              Remove
                            </Button>
                          </Stack>
                        ))}
                      </Stack>
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={createOptions.length >= MCQ_MAX}
                        onClick={() =>
                          setCreateOptions((prev) =>
                            prev.length >= MCQ_MAX ? prev : [...prev, ""],
                          )
                        }
                        sx={{ alignSelf: "flex-start" }}
                      >
                        Add choice
                      </Button>
                    </>
                  ) : (
                    <>
                      <TextField
                        label="Front"
                        value={createFront}
                        onChange={(ev) => setCreateFront(ev.target.value)}
                        multiline
                        minRows={2}
                        fullWidth
                        required
                      />
                      <TextField
                        label="Back"
                        value={createBack}
                        onChange={(ev) => setCreateBack(ev.target.value)}
                        multiline
                        minRows={2}
                        fullWidth
                        required
                      />
                    </>
                  )}
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={createBusy}
                  >
                    {createBusy ? "Adding…" : "Add card"}
                  </Button>
                </Stack>
              </Box>
            </Paper>
          ) : null}
        </Stack>
      )}

      <Dialog
        open={renameOpen}
        onClose={() => !renameBusy && setRenameOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <Box component="form" onSubmit={onRenameSubmit} noValidate>
          <DialogTitle>Rename deck</DialogTitle>
          <DialogContent>
            {renameError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {renameError}
              </Alert>
            ) : null}
            <TextField
              autoFocus
              margin="dense"
              label="Title"
              value={renameValue}
              onChange={(ev) => setRenameValue(ev.target.value)}
              required
              fullWidth
            />
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setRenameOpen(false)}
              disabled={renameBusy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={renameBusy || !renameValue.trim()}
            >
              {renameBusy ? "Saving…" : "Save"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => !deleteBusy && setConfirmDelete(false)}
      >
        <DialogTitle>Delete deck?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deck && deleteStats
              ? `Delete “${deck.title}”? This removes ${deleteStats.accepted} accepted card${deleteStats.accepted === 1 ? "" : "s"}, ${deleteStats.draft} draft${deleteStats.draft === 1 ? "" : "s"}, and ${deleteStats.materials} material${deleteStats.materials === 1 ? "" : "s"}.`
              : deck
                ? `Loading counts for “${deck.title}”…`
                : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmDelete(false)}
            disabled={deleteBusy}
          >
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

      <Dialog
        open={editCard !== null}
        onClose={() => !editBusy && !resetBusy && setEditCard(null)}
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
                disabled={editBusy || resetBusy}
                onChange={onEditChange}
                allowedTypes={["qa", "cloze", "mcq"]}
              />
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button
            color="warning"
            disabled={editBusy || resetBusy || !editCard}
            onClick={() => setConfirmReset(true)}
          >
            Reset schedule
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button
            onClick={() => setEditCard(null)}
            disabled={editBusy || resetBusy}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={editBusy || resetBusy || !editCard}
            onClick={saveEdit}
          >
            {editBusy ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmReset}
        onClose={() => !resetBusy && setConfirmReset(false)}
      >
        <DialogTitle>Reset schedule?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This sets the card’s FSRS schedule back to a new card (due now). Your
            card text is unchanged.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmReset(false)}
            disabled={resetBusy}
          >
            Cancel
          </Button>
          <Button
            color="warning"
            variant="contained"
            disabled={resetBusy}
            onClick={confirmResetSchedule}
          >
            {resetBusy ? "Resetting…" : "Reset schedule"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
