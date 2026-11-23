import { useCallback, useLayoutEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CalendarSuggestionsPanel } from "../calendar";
import { CreateMaterialStepper } from "../materials";
import { OperateSection } from "../materials";
import { ANKI_EXPORT_BUSY_LABEL } from "../export";
import { isGuest } from "../guest/session";
import { CoverPickerPanel, FigureSuggestPanel } from "../deckHub";
import { LibraryCreateSubjectPanel } from "../library/LibraryCreateSubjectPanel";
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
  const calendarRefresh = useCallback(() => calendarRefreshRef.current(), []);

  const {
    subjects,
    setSubjects,
    decks,
    setDecks,
    draftJobs,
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
    createCoverHold,
    closeCoverPicker,
    openCreateSubject,
    cancelCreateSubject,
    backFromCreateCover,
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

  const creatingSubject = titleDialog?.mode === "create" || createCoverHold;

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
        <Stack spacing={creatingSubject ? 0 : 2} sx={{ flex: 1, minHeight: 0 }}>
          {creatingSubject ? null : (
            <Box sx={{ flexShrink: 0 }}>
              <Stack
                direction="row"
                spacing={2}
                sx={{
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                  pb: 1.5,
                  borderBottom: 1,
                  borderColor: "divider"
                }}>
                <Box sx={{ minWidth: 0 }}>
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
                    Subjects
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
                    Library
                  </Typography>
                  {!selectMode && subjects.length > 0 ? (
                    <Typography
                      variant="body2"
                      sx={{
                        color: "text.secondary",
                        mt: 0.75
                      }}>
                      {subjects.length === 1
                        ? "1 subject"
                        : `${subjects.length} subjects`}
                      {decks.length > 0
                        ? ` · ${decks.length === 1 ? "1 deck" : `${decks.length} decks`}`
                        : null}
                    </Typography>
                  ) : null}
                  {selectMode ? (
                    <Typography
                      variant="body2"
                      sx={{
                        color: "text.secondary",
                        mt: 0.75
                      }}>
                      Tick the decks you want, then download them for Anki.
                    </Typography>
                  ) : null}
                </Box>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    flexShrink: 0,
                    pb: 0.25
                  }}>
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
                  {!selectMode && !guest && subjects.length > 0 ? (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => setSelectMode(true)}
                      sx={{ color: "text.secondary" }}
                    >
                      Download for Anki
                    </Button>
                  ) : null}
                </Stack>
              </Stack>
            </Box>
          )}

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

          {!creatingSubject && !guest ? (
            <CalendarSuggestionsPanel
              suggestions={calendar.suggestions}
              subjects={subjects}
              busyKey={calendar.busyKey}
              onAdd={calendar.onAdd}
              onLink={calendar.onLink}
              onDismiss={calendar.onDismiss}
            />
          ) : null}

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {creatingSubject ? (
              <Box
                key="create-subject"
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  animation: "libraryCreateIn 320ms cubic-bezier(0.2, 0, 0, 1)",
                  "@keyframes libraryCreateIn": {
                    from: { opacity: 0, transform: "translateX(40px)" },
                    to: { opacity: 1, transform: "translateX(0)" },
                  },
                  "@media (prefers-reduced-motion: reduce)": {
                    animation: "none",
                  },
                }}
              >
                {titleDialog?.mode === "create" ? (
                  <LibraryCreateSubjectPanel
                    guest={guest}
                    titleValue={titleValue}
                    setTitleValue={setTitleValue}
                    busy={dialogBusy}
                    error={dialogError}
                    onSubmit={onTitleDialogSubmit}
                    onCancel={cancelCreateSubject}
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
                      closeCoverPicker();
                    }}
                    onClear={onClearCover}
                    onCancel={closeCoverPicker}
                    onBack={backFromCreateCover}
                  />
                ) : null}
              </Box>
            ) : (
              <Box
                key="library-shelf"
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  animation: "libraryShelfIn 280ms cubic-bezier(0.2, 0, 0, 1)",
                  "@keyframes libraryShelfIn": {
                    from: { opacity: 0, transform: "translateX(-24px)" },
                    to: { opacity: 1, transform: "translateX(0)" },
                  },
                  "@media (prefers-reduced-motion: reduce)": {
                    animation: "none",
                  },
                }}
              >
                <LibraryShelf
                  subjects={subjects}
                  decks={decks}
                  covers={covers}
                  compositionBySubject={compositionBySubject}
                  draftJobs={draftJobs}
                  selectMode={selectMode}
                  selectedDeckIdSet={selectedDeckIdSet}
                  orphanDecks={orphanDecks}
                  toggleSubjectDecks={toggleSubjectDecks}
                  toggleDeckSelected={toggleDeckSelected}
                  setSubjectMenu={setSubjectMenu}
                  onCreateSubject={openCreateSubject}
                />
              </Box>
            )}
          </Box>

          {!creatingSubject && showCreateFlow && subjects.length > 0 ? (
            <OperateSection>
              <Stack
                direction="row"
                sx={{
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 1.5
                }}>
                <Typography
                  variant="subtitle1"
                  component="h2"
                  sx={{ fontWeight: 600, color: "primary.main" }}
                >
                  Add material
                </Typography>
                {decks.length > 0 ? (
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
                renderFigureSuggest={(args) => (
                  <FigureSuggestPanel
                    pdfFile={args.pdfFile}
                    disabled={args.disabled}
                    crops={args.crops}
                    onCropsChange={args.onCropsChange}
                  />
                )}
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
        closeCoverPicker={closeCoverPicker}
        suppressCoverDialog={createCoverHold}
        setCovers={setCovers}
        onClearCover={onClearCover}
      />
    </Container>
  );
}
