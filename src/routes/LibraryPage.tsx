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
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import CoverPickerDialog from "../components/CoverPickerDialog";
import OperateSection from "../components/OperateSection";
import ShelfVolume from "../components/ShelfVolume";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import {
  ApiError,
  apkgFilenameForDeckTitle,
  clearCover,
  createSelectionExport,
  createSubject,
  deleteSubject,
  listCovers,
  listDecks,
  listJobsWithDrafts,
  listMaterials,
  listSubjects,
  me,
  patchSubject,
  setCover,
  type Deck,
  type JobListItem,
  type MaterialListItem,
  type StoredCoverRow,
  type Subject,
  getJourney,
} from "../api/client";
import { deriveJourney } from "../journey/derive";
import CalendarSuggestionsPanel from "../components/CalendarSuggestionsPanel";
import CreateMaterialStepper from "../components/CreateMaterialStepper";
import MaterialsList from "../components/MaterialsList";
import {
  formatExportWarnings,
  ANKI_EXPORT_BUSY_LABEL,
  runAnkiExportDownload,
} from "../export/runAnkiExport";
import { isGuest } from "../guest/session";
import { libraryShowsCreateFlow } from "../library/libraryCreateFlow";
import { useCalendarSuggestions } from "../library/useCalendarSuggestions";
import { navigate } from "../nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";
import {
  effectiveSubjectDeckCount,
  subjectDeleteBlocked,
} from "../subjects/subjectDeleteGuard";

type TitleDialog =
  { mode: "create" } | { mode: "rename"; subject: Subject } | null;

type CoverTarget = {
  ownerKind: "subject";
  ownerId: string;
  title: string;
};

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
  /** Wizard opens only when the loaded library has no subjects. */
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const createFlowSeededRef = useRef(false);
  const [selectMode, setSelectMode] = useState(false);
  const [subjectMenu, setSubjectMenu] = useState<{
    anchor: HTMLElement;
    subject: Subject;
  } | null>(null);
  const [covers, setCovers] = useState<StoredCoverRow[]>([]);
  const [coverPicker, setCoverPicker] = useState<CoverTarget | null>(null);
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
  const calendar = useCalendarSuggestions(guest, setSubjects, setError);

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
        const [subjectList, deckList, jobs, materialList, coverList] =
          await Promise.all([
            listSubjects(),
            listDecks(),
            listJobsWithDrafts().catch(() => [] as JobListItem[]),
            guest
              ? Promise.resolve([] as MaterialListItem[])
              : listMaterials().catch(() => [] as MaterialListItem[]),
            guest
              ? Promise.resolve([] as StoredCoverRow[])
              : listCovers().catch(() => [] as StoredCoverRow[]),
          ]);
        if (cancelled) return;
        setSubjects(subjectList);
        setDecks(deckList);
        setDraftJobs(jobs);
        setMaterials(materialList);
        setCovers(coverList);
        setReady(true);
        endLoad();
        void calendar.refresh();
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
            setShowCreateFlow(libraryShowsCreateFlow(subjectList.length));
          }
        } catch {
          if (!cancelled && !createFlowSeededRef.current) {
            createFlowSeededRef.current = true;
            setShowCreateFlow(libraryShowsCreateFlow(subjectList.length));
          }
        }
      } catch (err) {
        if (cancelled) return;
        setShowCreateFlow(false);
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
  }, [calendar.refresh, endLoad, guest]);

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
      const saved =
        titleDialog.mode === "create"
          ? await createSubject(titleValue.trim())
          : await patchSubject(titleDialog.subject.id, titleValue.trim());
      if (titleDialog.mode === "create") {
        setSubjects((prev) => [...prev, saved]);
      } else {
        setSubjects((prev) =>
          prev.map((s) => (s.id === saved.id ? { ...s, ...saved } : s)),
        );
      }
      setTitleDialog(null);
      if (!guest) {
        setCoverPicker({
          ownerKind: "subject",
          ownerId: saved.id,
          title: saved.title,
        });
      }
    } catch (err) {
      setDialogError(
        err instanceof ApiError ? err.message : "Could not save subject",
      );
    } finally {
      setDialogBusy(false);
    }
  }

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
  const menuSubject = subjectMenu?.subject ?? null;
  const menuDeleteBlocked = menuSubject
    ? subjectDeleteBlocked(
        menuSubject,
        localDeckCountForSubject(menuSubject.id),
      )
    : false;
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 5 } }}>
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
                ? "Tick the decks you want, then download them for Anki."
                : "Choose a subject. Each one holds decks of flashcards."}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              flexWrap="wrap"
              useFlexGap
              sx={{ mt: 2 }}
            >
              {!guest && selectMode ? (
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
                      : selectionCount > 0
                        ? `Download (${selectionCount})`
                        : "Download"}
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
              ) : null}
              {!selectMode ? (
                <>
                  {!guest && (subjects.length > 0 || decks.length > 0) ? (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => setSelectMode(true)}
                    >
                      Download for Anki
                    </Button>
                  ) : null}
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

          {!guest ? (
            <CalendarSuggestionsPanel
              suggestions={calendar.suggestions}
              subjects={subjects}
              busyKey={calendar.busyKey}
              onAdd={calendar.onAdd}
              onLink={calendar.onLink}
              onDismiss={calendar.onDismiss}
            />
          ) : null}

          {subjects.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {showCreateFlow
                ? "No subjects yet. Add your notes to make the first one."
                : "No subjects yet. Use Add material to create a subject and deck."}
            </Typography>
          ) : (
            <Grid
              container
              component="ul"
              spacing={2}
              sx={{ listStyle: "none", p: 0, m: 0 }}
            >
              {subjects.map((s) => {
                const localCount = localDeckCountForSubject(s.id);
                const deckCount = effectiveSubjectDeckCount(s, localCount);
                const subjectDecks = decks.filter((d) => d.subject_id === s.id);
                const selectedChildCount = subjectDecks.filter((d) =>
                  selectedDeckIdSet.has(d.id),
                ).length;
                const subjectFullySelected =
                  subjectDecks.length > 0 &&
                  selectedChildCount === subjectDecks.length;
                const subjectPartiallySelected =
                  selectedChildCount > 0 && !subjectFullySelected;
                const meta =
                  deckCount === 0
                    ? "No decks yet"
                    : deckCount === 1
                      ? "1 deck"
                      : `${deckCount} decks`;
                const href = `/library/subjects/${encodeURIComponent(s.id)}`;
                return (
                  <Grid key={s.id} component="li" size={{ xs: 12, md: 6 }}>
                    <ShelfVolume
                      title={s.title}
                      href={href}
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
                      meta={meta}
                      studyLabel="Study"
                      onStudy={() => {
                        navigate(
                          `/study?subjectId=${encodeURIComponent(s.id)}`,
                        );
                      }}
                      cover={
                        covers.find(
                          (cover) =>
                            cover.ownerKind === "subject" &&
                            cover.ownerId === s.id,
                        ) ?? null
                      }
                      moreLabel={`More actions for ${s.title}`}
                      onMore={(ev) => {
                        setSubjectMenu({
                          anchor: ev.currentTarget,
                          subject: s,
                        });
                      }}
                      select={
                        selectMode
                          ? {
                              checked: subjectFullySelected,
                              indeterminate: subjectPartiallySelected,
                              disabled: subjectDecks.length === 0,
                              onChange: () => toggleSubjectDecks(s.id),
                              inputLabel: `Select all decks in ${s.title}`,
                            }
                          : undefined
                      }
                    >
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
                    </ShelfVolume>
                  </Grid>
                );
              })}
            </Grid>
          )}
          {selectMode && orphanDecks.length > 0 ? (
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 0.5 }}
              >
                Decks without a subject
              </Typography>
              <Stack
                component="ul"
                spacing={0}
                sx={{ m: 0, p: 0, listStyle: "none" }}
              >
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

          {draftJobs.length > 0 ? (
            <OperateSection>
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, mb: 0.5, color: "primary.main" }}
              >
                Cards to check
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                These still need a look before you study them.
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
                      ? "1 card to check"
                      : `${job.draft_count} cards to check`;
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
                        py: 1.5,
                      }}
                    >
                      <Link
                        href={`/jobs/${encodeURIComponent(job.id)}/drafts`}
                        underline="hover"
                        color="primary"
                        variant="body1"
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
                deckChipsBySubjectId={calendar.deckChipsBySubjectId}
                activeStep={activeStep}
                setActiveStep={setActiveStep}
                localOnly={guest}
                onChanged={async () => {
                  await syncStepperFromJourney();
                  await refreshDraftJobs();
                  await refreshMaterials();
                  await refreshSubjects();
                  await calendar.refresh();
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
                Your files
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
          onClose={() => setCoverPicker(null)}
          onPick={onPickCover}
          onClear={onClearCover}
        />
      )}
    </Container>
  );
}
