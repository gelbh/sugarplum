import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import OperateSection from "../components/OperateSection";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  ApiError,
  apkgFilenameForDeckTitle,
  createSelectionExport,
  createSubject,
  deleteSubject,
  listDecks,
  listJobsWithDrafts,
  listMaterials,
  listSubjects,
  me,
  patchSubject,
  type Deck,
  type JobListItem,
  type MaterialListItem,
  type Subject,
  getJourney,
} from "../api/client";
import { deriveJourney } from "../journey/derive";
import CreateMaterialStepper from "../components/CreateMaterialStepper";
import MaterialsList from "../components/MaterialsList";
import {
  formatExportWarnings,
  ANKI_EXPORT_BUSY_LABEL,
  runAnkiExportDownload,
} from "../export/runAnkiExport";
import { isGuest } from "../guest/session";
import { navigate } from "../nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";
import {
  effectiveSubjectDeckCount,
  subjectDeleteBlocked,
} from "../subjects/subjectDeleteGuard";

type TitleDialog =
  { mode: "create" } | { mode: "rename"; subject: Subject } | null;

export default function LibraryPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [draftJobs, setDraftJobs] = useState<JobListItem[]>([]);
  const [materials, setMaterials] = useState<MaterialListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [titleDialog, setTitleDialog] = useState<TitleDialog>(null);
  const [titleValue, setTitleValue] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [deleteSubjectTarget, setDeleteSubjectTarget] =
    useState<Subject | null>(null);
  const [deleteSubjectBusy, setDeleteSubjectBusy] = useState(false);
  /** Create wizard stays closed once a catalog exists; first-run opens it. */
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const createFlowSeededRef = useRef(false);
  const [selectMode, setSelectMode] = useState(false);
  /** Selection is deck ids only; subject checkbox toggles all decks in that subject. */
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportWarning, setExportWarning] = useState<string | null>(null);
  const guest = isGuest();
  const { end: endLoad } = useTrackedOp("Loading library…", {
    trackOnMount: true,
  });
  const { busy: exportBusy, run: runExport } =
    useTrackedOp(ANKI_EXPORT_BUSY_LABEL);

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

  const refreshMaterials = useCallback(async () => {
    if (guest) {
      setMaterials([]);
      return;
    }
    try {
      setMaterials(await listMaterials());
    } catch {
      setMaterials([]);
    }
  }, [guest]);

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
        const [subjectList, deckList, jobs, materialList] = await Promise.all([
          listSubjects(),
          listDecks(),
          listJobsWithDrafts().catch(() => [] as JobListItem[]),
          guest
            ? Promise.resolve([] as MaterialListItem[])
            : listMaterials().catch(() => [] as MaterialListItem[]),
        ]);
        if (cancelled) return;
        setSubjects(subjectList);
        setDecks(deckList);
        setDraftJobs(jobs);
        setMaterials(materialList);
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
          if (!createFlowSeededRef.current) {
            createFlowSeededRef.current = true;
            setShowCreateFlow(
              subjectList.length === 0 ||
                deckList.length === 0 ||
                derived.next.action === "create_deck" ||
                derived.next.action === "add_material",
            );
          }
        } catch {
          if (!cancelled && !createFlowSeededRef.current) {
            createFlowSeededRef.current = true;
            setShowCreateFlow(
              subjectList.length === 0 || deckList.length === 0,
            );
          }
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
  }, [endLoad, guest]);

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

  function localDeckCountForSubject(subjectId: string) {
    return decks.filter((d) => d.subject_id === subjectId).length;
  }

  function requestDeleteSubject(subject: Subject, ev: MouseEvent) {
    ev.stopPropagation();
    const localCount = localDeckCountForSubject(subject.id);
    if (subjectDeleteBlocked(subject, localCount)) return;
    setError(null);
    setDeleteSubjectTarget(subject);
  }

  async function confirmDeleteSubject() {
    if (!deleteSubjectTarget) return;
    setDeleteSubjectBusy(true);
    setError(null);
    try {
      await deleteSubject(deleteSubjectTarget.id);
      setSubjects((prev) =>
        prev.filter((s) => s.id !== deleteSubjectTarget.id),
      );
      setDeleteSubjectTarget(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await Promise.all([refreshSubjects(), refreshDecks()]);
        setDeleteSubjectTarget(null);
      }
      setError(
        err instanceof ApiError ? err.message : "Could not delete subject",
      );
    } finally {
      setDeleteSubjectBusy(false);
    }
  }

  function openSubject(subjectId: string) {
    navigate(`/library/subjects/${encodeURIComponent(subjectId)}`);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedDeckIds([]);
  }

  function toggleDeckSelected(deckId: string) {
    setSelectedDeckIds((prev) =>
      prev.includes(deckId)
        ? prev.filter((id) => id !== deckId)
        : [...prev, deckId],
    );
  }

  function toggleSubjectDecks(subjectId: string) {
    const childIds = decks
      .filter((d) => d.subject_id === subjectId)
      .map((d) => d.id);
    if (childIds.length === 0) return;
    setSelectedDeckIds((prev) => {
      const selected = new Set(prev);
      const allOn = childIds.every((id) => selected.has(id));
      if (allOn) {
        for (const id of childIds) selected.delete(id);
      } else {
        for (const id of childIds) selected.add(id);
      }
      return [...selected];
    });
  }

  async function onExportSelected() {
    if (guest) return;
    if (selectedDeckIds.length === 0) return;
    setError(null);
    setNotice(null);
    setExportWarning(null);
    try {
      await runExport(async () => {
        const warnings = await runAnkiExportDownload(
          () =>
            createSelectionExport({
              subjectIds: [],
              deckIds: selectedDeckIds,
            }),
          apkgFilenameForDeckTitle("Sugarplum export"),
        );
        const warningText = formatExportWarnings(warnings);
        if (warningText) {
          setExportWarning(warningText);
        } else {
          setNotice("Anki package downloaded");
        }
        exitSelectMode();
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    }
  }

  const selectedDeckIdSet = new Set(selectedDeckIds);
  const selectionCount = selectedDeckIds.length;
  const orphanDecks = decks.filter((d) => d.subject_id == null);
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
              {selectMode
                ? "Select decks to export (subject checkbox selects all decks in that subject)."
                : "Pick a subject, or add material to make cards."}
            </Typography>
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

          {draftJobs.length > 0 ? (
            <OperateSection>
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
              >
                Ready to review
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
                    <Box
                      component="li"
                      key={job.id}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        py: 1,
                      }}
                    >
                      <Link
                        href={`/jobs/${encodeURIComponent(job.id)}/drafts`}
                        underline="hover"
                        color="primary"
                        variant="body2"
                        sx={{ flex: 1, minWidth: 0 }}
                      >
                        {label}
                        {suffix}
                      </Link>
                      <ChevronRightIcon
                        fontSize="small"
                        sx={{ color: "text.secondary" }}
                        aria-hidden
                      />
                    </Box>
                  );
                })}
              </Stack>
            </OperateSection>
          ) : null}

          <OperateSection>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1.5 }}
              spacing={1}
            >
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, color: "primary.main" }}
              >
                Subjects
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {!guest ? (
                  selectMode ? (
                    <>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={exportBusy || selectionCount === 0}
                        onClick={() => {
                          void onExportSelected();
                        }}
                      >
                        {exportBusy
                          ? "Exporting…"
                          : `Export selected${selectionCount > 0 ? ` (${selectionCount})` : ""}`}
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        disabled={exportBusy}
                        onClick={exitSelectMode}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={subjects.length === 0 && decks.length === 0}
                      onClick={() => setSelectMode(true)}
                    >
                      Select
                    </Button>
                  )
                ) : null}
                {!selectMode ? (
                  <>
                    {subjects.length > 0 ? (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={openCreateSubject}
                      >
                        New subject
                      </Button>
                    ) : null}
                    {!showCreateFlow ? (
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => setShowCreateFlow(true)}
                      >
                        Add material
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </Stack>
            </Stack>
            {subjects.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {showCreateFlow
                  ? "No subjects yet. Continue in Add material below."
                  : "No subjects yet. Use Add material to create a subject and deck."}
              </Typography>
            ) : (
              <Stack
                component="ul"
                spacing={0}
                divider={<Divider flexItem />}
                sx={{ m: 0, p: 0, listStyle: "none" }}
              >
                {subjects.map((s) => {
                  const localCount = localDeckCountForSubject(s.id);
                  const deckCount = effectiveSubjectDeckCount(s, localCount);
                  const deleteBlocked = subjectDeleteBlocked(s, localCount);
                  const subjectDecks = decks.filter((d) => d.subject_id === s.id);
                  const selectedChildCount = subjectDecks.filter((d) =>
                    selectedDeckIdSet.has(d.id),
                  ).length;
                  const subjectFullySelected =
                    subjectDecks.length > 0 &&
                    selectedChildCount === subjectDecks.length;
                  const subjectPartiallySelected =
                    selectedChildCount > 0 && !subjectFullySelected;
                  return (
                    <Box component="li" key={s.id} sx={{ py: 1 }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          "&:hover": selectMode
                            ? undefined
                            : { bgcolor: "action.hover" },
                        }}
                      >
                        {selectMode ? (
                          <Checkbox
                            size="small"
                            checked={subjectFullySelected}
                            indeterminate={subjectPartiallySelected}
                            disabled={subjectDecks.length === 0}
                            onChange={() => toggleSubjectDecks(s.id)}
                            inputProps={{
                              "aria-label": `Select all decks in ${s.title}`,
                            }}
                          />
                        ) : null}
                        <Box
                          role={selectMode ? "button" : "link"}
                          tabIndex={0}
                          aria-label={
                            selectMode
                              ? `Select all decks in ${s.title}`
                              : `Open subject ${s.title}`
                          }
                          onClick={() => {
                            if (selectMode) {
                              toggleSubjectDecks(s.id);
                              return;
                            }
                            openSubject(s.id);
                          }}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              if (selectMode) {
                                toggleSubjectDecks(s.id);
                                return;
                              }
                              openSubject(s.id);
                            }
                          }}
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            cursor: "pointer",
                            borderRadius: 1,
                            outlineOffset: 2,
                          }}
                        >
                          <Typography variant="body2" noWrap fontWeight={500}>
                            {s.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {deckCount === 1 ? "1 deck" : `${deckCount} decks`}
                          </Typography>
                        </Box>
                        {!selectMode ? (
                          <>
                            <Button
                              size="small"
                              variant="text"
                              aria-label={`Study this subject ${s.title}`}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                navigate(
                                  `/study?subjectId=${encodeURIComponent(s.id)}`,
                                );
                              }}
                            >
                              Study
                            </Button>
                            <IconButton
                              size="small"
                              aria-label={`Rename ${s.title}`}
                              onClick={(ev) => openRenameSubject(s, ev)}
                              sx={{ color: "text.secondary" }}
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
                                  onClick={(ev) => requestDeleteSubject(s, ev)}
                                  sx={{ color: "text.secondary" }}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <ChevronRightIcon
                              fontSize="small"
                              sx={{ color: "text.secondary", flexShrink: 0 }}
                              aria-hidden
                            />
                          </>
                        ) : null}
                      </Box>
                      {selectMode && subjectDecks.length > 0 ? (
                        <Stack
                          component="ul"
                          spacing={0}
                          sx={{
                            m: 0,
                            mt: 0.5,
                            mb: 0,
                            mr: 0,
                            ml: 0,
                            pl: 5,
                            pr: 0,
                            py: 0,
                            listStyle: "none",
                          }}
                        >
                          {subjectDecks.map((deck) => (
                            <Box
                              component="li"
                              key={deck.id}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                                py: 0.25,
                              }}
                            >
                              <Checkbox
                                size="small"
                                checked={selectedDeckIdSet.has(deck.id)}
                                onChange={() => toggleDeckSelected(deck.id)}
                                inputProps={{
                                  "aria-label": `Select deck ${deck.title}`,
                                }}
                              />
                              <Typography variant="body2" color="text.secondary">
                                {deck.title}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      ) : null}
                    </Box>
                  );
                })}
              </Stack>
            )}
            {selectMode && orphanDecks.length > 0 ? (
              <Box sx={{ mt: 2 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 0.5 }}
                >
                  Decks without a subject
                </Typography>
                <Stack component="ul" spacing={0} sx={{ m: 0, p: 0, listStyle: "none" }}>
                  {orphanDecks.map((deck) => (
                    <Box
                      component="li"
                      key={deck.id}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        py: 0.25,
                      }}
                    >
                      <Checkbox
                        size="small"
                        checked={selectedDeckIdSet.has(deck.id)}
                        onChange={() => toggleDeckSelected(deck.id)}
                        inputProps={{
                          "aria-label": `Select deck ${deck.title}`,
                        }}
                      />
                      <Typography variant="body2">{deck.title}</Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            ) : null}
          </OperateSection>

          {showCreateFlow ? (
            <OperateSection>
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
                  Add material
                </Typography>
                {subjects.length > 0 && decks.length > 0 ? (
                  <Button size="small" onClick={() => setShowCreateFlow(false)}>
                    Hide
                  </Button>
                ) : null}
              </Stack>
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
                  await refreshMaterials();
                  await refreshSubjects();
                  await refreshDecks();
                }}
              />
            </OperateSection>
          ) : null}

          {!guest && materials.length > 0 ? (
            <OperateSection>
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
              >
                Materials
              </Typography>
              <MaterialsList
                materials={materials}
                showDeckTitle
                onChanged={() => {
                  void Promise.all([refreshMaterials(), refreshDraftJobs()]);
                }}
              />
            </OperateSection>
          ) : null}
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
    </Container>
  );
}
