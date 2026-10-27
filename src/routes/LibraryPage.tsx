import { useCallback, useEffect, useState, type FormEvent, type MouseEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
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
  createSubject,
  deleteSubject,
  listDecks,
  listJobsWithDrafts,
  listSubjects,
  me,
  patchSubject,
  type Deck,
  type JobListItem,
  type Subject,
  getJourney,
} from "../api/client";
import { deriveJourney } from "../journey/derive";
import CreateMaterialStepper from "../components/CreateMaterialStepper";
import { isGuest } from "../guest/session";
import { navigate } from "../nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";

type TitleDialog =
  | { mode: "create" }
  | { mode: "rename"; subject: Subject }
  | null;

export default function LibraryPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [draftJobs, setDraftJobs] = useState<JobListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [titleDialog, setTitleDialog] = useState<TitleDialog>(null);
  const [titleValue, setTitleValue] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const guest = isGuest();
  const { end: endLoad } = useTrackedOp("Loading library…", {
    trackOnMount: true,
  });

  const syncStepperFromJourney = useCallback(async () => {
    try {
      const derived = deriveJourney(await getJourney());
      setActiveStep(derived.next.action === "create_deck" ? 0 : 1);
    } catch {
      /* journey is optional for Library */
    }
  }, []);

  const refreshDraftJobs = useCallback(async () => {
    try {
      setDraftJobs(await listJobsWithDrafts());
    } catch {
      /* draft links are optional; subjects/stepper still work */
    }
  }, []);

  const refreshSubjects = useCallback(async () => {
    setSubjects(await listSubjects());
  }, []);

  const refreshDecks = useCallback(async () => {
    setDecks(await listDecks());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        const [subjectList, deckList, jobs] = await Promise.all([
          listSubjects(),
          listDecks(),
          listJobsWithDrafts().catch(() => [] as JobListItem[]),
        ]);
        if (cancelled) return;
        setSubjects(subjectList);
        setDecks(deckList);
        setDraftJobs(jobs);
        setReady(true);
        endLoad();
        try {
          const derived = deriveJourney(await getJourney());
          if (cancelled) return;
          if (derived.next.action === "create_deck") {
            setActiveStep(0);
          } else if (deckList.length > 0) {
            setActiveStep(1);
          }
        } catch {
          /* ignore */
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Failed to load library",
        );
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad]);

  function openCreateSubject() {
    setDialogError(null);
    setTitleValue("");
    setTitleDialog({ mode: "create" });
  }

  function openRenameSubject(subject: Subject, ev: MouseEvent) {
    ev.stopPropagation();
    setDialogError(null);
    setTitleValue(subject.title);
    setTitleDialog({ mode: "rename", subject });
  }

  async function onTitleDialogSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!titleDialog || !titleValue.trim()) return;
    setDialogBusy(true);
    setDialogError(null);
    try {
      if (titleDialog.mode === "create") {
        const created = await createSubject(titleValue.trim());
        setSubjects((prev) => [...prev, created]);
      } else {
        const updated = await patchSubject(
          titleDialog.subject.id,
          titleValue.trim(),
        );
        setSubjects((prev) =>
          prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
        );
      }
      setTitleDialog(null);
    } catch (err) {
      setDialogError(
        err instanceof ApiError ? err.message : "Could not save subject",
      );
    } finally {
      setDialogBusy(false);
    }
  }

  async function onDeleteSubject(subject: Subject, ev: MouseEvent) {
    ev.stopPropagation();
    if ((subject.deck_count ?? 0) > 0) return;
    setError(null);
    try {
      await deleteSubject(subject.id);
      setSubjects((prev) => prev.filter((s) => s.id !== subject.id));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete subject",
      );
    }
  }

  function openSubject(subjectId: string) {
    navigate(`/library/subjects/${encodeURIComponent(subjectId)}`);
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 5 } }}>
      {!ready ? (
        <Typography color="text.secondary">Loading library…</Typography>
      ) : (
        <Stack spacing={3}>
          <Box>
            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              sx={{ color: "text.primary", fontWeight: 600 }}
            >
              Library
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Organize subjects, then decks. Paste notes or upload PDF, PPTX, or
              image materials.
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
                Your subjects
              </Typography>
              <Button size="small" variant="outlined" onClick={openCreateSubject}>
                Create subject
              </Button>
            </Stack>
            {subjects.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No subjects yet. Create one to hold decks.
              </Typography>
            ) : (
              <Stack
                component="ul"
                spacing={0}
                divider={<Divider flexItem />}
                sx={{ m: 0, p: 0, listStyle: "none" }}
              >
                {subjects.map((s) => {
                  const deckCount = s.deck_count ?? 0;
                  const deleteBlocked = deckCount > 0;
                  return (
                    <Box
                      component="li"
                      key={s.id}
                      onClick={() => openSubject(s.id)}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        py: 1,
                        cursor: "pointer",
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" noWrap>
                          {s.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {deckCount === 1
                            ? "1 deck"
                            : `${deckCount} decks`}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        aria-label={`Rename ${s.title}`}
                        onClick={(ev) => openRenameSubject(s, ev)}
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <Tooltip
                        title={
                          deleteBlocked
                            ? "Remove or move decks before deleting this subject"
                            : "Delete subject"
                        }
                      >
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Delete ${s.title}`}
                            disabled={deleteBlocked}
                            onClick={(ev) => onDeleteSubject(s, ev)}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Paper>

          {draftJobs.length > 0 ? (
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
                Draft reviews
              </Typography>
              <Stack
                component="ul"
                spacing={0}
                divider={<Divider flexItem />}
                sx={{ m: 0, p: 0, listStyle: "none" }}
              >
                {draftJobs.map((job) => {
                  const filename = job.filename?.trim() || null;
                  const label = filename || job.deck_title;
                  const countLabel =
                    job.draft_count === 1
                      ? "1 draft"
                      : `${job.draft_count} drafts`;
                  const suffix = filename
                    ? ` · ${countLabel} · ${job.deck_title}`
                    : ` · ${countLabel}`;
                  return (
                    <Typography
                      component="li"
                      key={job.id}
                      variant="body2"
                      sx={{ py: 1 }}
                    >
                      <Link
                        href={`/jobs/${encodeURIComponent(job.id)}/drafts`}
                        underline="hover"
                        color="primary"
                      >
                        {label}
                      </Link>
                      {suffix}
                    </Typography>
                  );
                })}
              </Stack>
            </Paper>
          ) : null}

          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              bgcolor: "background.paper",
              borderColor: "divider",
            }}
          >
            <CreateMaterialStepper
              decks={decks}
              setDecks={setDecks}
              subjects={subjects}
              setSubjects={setSubjects}
              activeStep={activeStep}
              setActiveStep={setActiveStep}
              localOnly={guest}
              onChanged={async () => {
                await syncStepperFromJourney();
                await refreshDraftJobs();
                await refreshSubjects();
                await refreshDecks();
              }}
            />
          </Paper>

          <Typography variant="body2">
            <Link href="/today" underline="hover" color="primary">
              Back home
            </Link>
          </Typography>
        </Stack>
      )}

      <Dialog
        open={titleDialog !== null}
        onClose={() => !dialogBusy && setTitleDialog(null)}
        fullWidth
        maxWidth="xs"
      >
        <Box component="form" onSubmit={onTitleDialogSubmit} noValidate>
          <DialogTitle>
            {titleDialog?.mode === "rename" ? "Rename subject" : "Create subject"}
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
    </Container>
  );
}
