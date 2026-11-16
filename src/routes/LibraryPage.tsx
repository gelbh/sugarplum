import { useCallback, useLayoutEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CalendarSuggestionsPanel from "../components/CalendarSuggestionsPanel";
import CreateMaterialStepper from "../components/CreateMaterialStepper";
import MaterialsList from "../components/MaterialsList";
import OperateSection from "../components/OperateSection";
import { ANKI_EXPORT_BUSY_LABEL } from "../export/runAnkiExport";
import { isGuest } from "../guest/session";
import { LibraryDialogs } from "../library/LibraryDialogs";
import { LibraryShelf } from "../library/LibraryShelf";
import { useCalendarSuggestions } from "../library/useCalendarSuggestions";
import { useLibraryLoad } from "../library/useLibraryLoad";
import { useLibrarySelectionExport } from "../library/useLibrarySelectionExport";
import { useLibrarySubjectDialogs } from "../library/useLibrarySubjectDialogs";
import { useTrackedOp } from "../progress/useTrackedOp";

export default function LibraryPage() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportWarning, setExportWarning] = useState<string | null>(null);
  const guest = isGuest();
  const { end: endLoad } = useTrackedOp("Loading library…", {
    trackOnMount: true,
  });
  const { busy: exportBusy, run: runExport } = useTrackedOp(
    ANKI_EXPORT_BUSY_LABEL,
  );
  const calendarRefreshRef = useRef<() => void | Promise<void>>(() => {});
  const calendarRefresh = useCallback(
    () => calendarRefreshRef.current(),
    [],
  );

  const {
    subjects,
    setSubjects,
    decks,
    setDecks,
    draftJobs,
    materials,
    ready,
    activeStep,
    setActiveStep,
    showCreateFlow,
    setShowCreateFlow,
    covers,
    setCovers,
    compositionBySubject,
    syncStepperFromJourney,
    refreshDraftJobs,
    refreshMaterials,
    refreshSubjects,
    refreshDecks,
    refreshCompositionSummaries,
  } = useLibraryLoad({
    guest,
    endLoad,
    calendarRefresh,
    setError,
  });

  const calendar = useCalendarSuggestions(guest, setSubjects, setError);
  // Layout so the load mount effect (useEffect) sees the real refresh on first paint.
  useLayoutEffect(() => {
    calendarRefreshRef.current = calendar.refresh;
  }, [calendar.refresh]);

  const {
    titleDialog,
    setTitleDialog,
    titleValue,
    setTitleValue,
    dialogBusy,
    dialogError,
    deleteSubjectTarget,
    setDeleteSubjectTarget,
    deleteSubjectBusy,
    subjectMenu,
    setSubjectMenu,
    coverPicker,
    setCoverPicker,
    openCreateSubject,
    openRenameSubject,
    onTitleDialogSubmit,
    onClearCover,
    requestDeleteSubject,
    confirmDeleteSubject,
    menuSubject,
    menuDeleteBlocked,
  } = useLibrarySubjectDialogs({
    guest,
    decks,
    setSubjects,
    setCovers,
    setError,
    refreshSubjects,
    refreshDecks,
  });

  const {
    selectMode,
    setSelectMode,
    exitSelectMode,
    toggleDeckSelected,
    toggleSubjectDecks,
    onExportSelected,
    selectedDeckIdSet,
    selectionCount,
    orphanDecks,
  } = useLibrarySelectionExport({
    guest,
    decks,
    setError,
    setNotice,
    setExportWarning,
    runExport,
  });

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
          <Skeleton variant="text" width={120} height={40} />
          <Skeleton variant="text" width="60%" />
          <Grid container spacing={2}>
            {[0, 1, 2, 3].map((key) => (
              <Grid key={key} size={{ xs: 6, sm: 4, md: 3 }}>
                <Skeleton
                  variant="rounded"
                  height={160}
                  sx={{ borderRadius: 2 }}
                />
              </Grid>
            ))}
          </Grid>
        </Stack>
      ) : (
        <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
          <Box sx={{ flexShrink: 0 }}>
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

          <LibraryShelf
            subjects={subjects}
            decks={decks}
            covers={covers}
            compositionBySubject={compositionBySubject}
            showCreateFlow={showCreateFlow}
            setShowCreateFlow={setShowCreateFlow}
            selectMode={selectMode}
            selectedDeckIdSet={selectedDeckIdSet}
            orphanDecks={orphanDecks}
            toggleSubjectDecks={toggleSubjectDecks}
            toggleDeckSelected={toggleDeckSelected}
            setSubjectMenu={setSubjectMenu}
            onCreateSubject={openCreateSubject}
          />

          {draftJobs.length > 0 ? (
            <OperateSection>
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, mb: 0.5, color: "primary.main" }}
              >
                Cards to check
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1.5 }}
              >
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
                  await refreshCompositionSummaries();
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
                onAddMaterial={() => setShowCreateFlow(true)}
              />
            </OperateSection>
          ) : null}
        </Stack>
      )}

      <LibraryDialogs
        guest={guest}
        titleDialog={titleDialog}
        setTitleDialog={setTitleDialog}
        titleValue={titleValue}
        setTitleValue={setTitleValue}
        dialogBusy={dialogBusy}
        dialogError={dialogError}
        onTitleDialogSubmit={onTitleDialogSubmit}
        deleteSubjectTarget={deleteSubjectTarget}
        setDeleteSubjectTarget={setDeleteSubjectTarget}
        deleteSubjectBusy={deleteSubjectBusy}
        confirmDeleteSubject={confirmDeleteSubject}
        subjectMenu={subjectMenu}
        setSubjectMenu={setSubjectMenu}
        menuSubject={menuSubject}
        menuDeleteBlocked={menuDeleteBlocked}
        openRenameSubject={openRenameSubject}
        requestDeleteSubject={requestDeleteSubject}
        coverPicker={coverPicker}
        setCoverPicker={setCoverPicker}
        setCovers={setCovers}
        onClearCover={onClearCover}
      />
    </Container>
  );
}
