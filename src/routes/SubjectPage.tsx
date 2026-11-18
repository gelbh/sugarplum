import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import CoverHeroThumb from "../ui/CoverHeroThumb";
import { LibraryCreateSubjectPanel } from "../library/LibraryCreateSubjectPanel";
import MagazineEmptyStage from "../library/MagazineEmptyStage";
import StageBreadcrumbs from "../ui/StageBreadcrumbs";
import {
  type Deck,
  type DeckStats,
  type JobListItem,
  type StoredCoverRow,
  type Subject,
  type SubjectKnowledge,
} from "../api/client";
import SubjectKnowledgeBar from "../components/SubjectKnowledgeBar";
import { ANKI_EXPORT_BUSY_LABEL } from "../export/runAnkiExport";
import { isGuest } from "../guest/session";
import { useTrackedOp } from "../progress/useTrackedOp";
import { createSubjectCover } from "../subjects/subjectCover";
import { createSubjectDelete } from "../subjects/subjectDelete";
import { subjectDeleteBlocked } from "../subjects/subjectDeleteGuard";
import { createSubjectExport } from "../subjects/subjectExport";
import { createSubjectTitleDialogs } from "../subjects/subjectTitleDialogs";
import type { CoverTarget, TitleDialog } from "../subjects/subjectTypes";
import { useSubjectLoad } from "../subjects/useSubjectLoad";

type Props = {
  subjectId: string;
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

  const { syncSubjectFromList, refreshKnowledge } = useSubjectLoad({
    subjectId,
    guest,
    endLoad,
    setSubject,
    setDecks,
    setCovers,
    setKnowledge,
    setDraftJobs,
    setError,
    setReady,
  });

  const {
    openRenameSubject,
    openCreateDeck,
    cancelCreateDeck,
    finishCreateDeck,
    backFromCreateDeckCover,
    closeCreateDeckCover,
    openRenameDeck,
    onTitleDialogSubmit,
  } = createSubjectTitleDialogs({
    subjectId,
    guest,
    subject,
    titleDialog,
    titleValue,
    createFlowDeck,
    syncSubjectFromList,
    setTitleDialog,
    setTitleValue,
    setDialogBusy,
    setDialogError,
    setCreateDeckHold,
    setCreateFlowDeck,
    setCoverPicker,
    setDecks,
    setSubject,
  });

  const { openCoverPicker, openDeckCoverPicker, onCoverSaved, onClearCover } =
    createSubjectCover({
      subject,
      guest,
      coverPicker,
      createDeckHold,
      finishCreateDeck,
      setCoverPicker,
      setCovers,
    });

  const {
    requestDeleteSubject,
    confirmDeleteSubject,
    openDeleteDeck,
    confirmDeleteDeck,
  } = createSubjectDelete({
    subject,
    decks,
    deleteTarget,
    syncSubjectFromList,
    refreshKnowledge,
    setError,
    setConfirmSubjectDelete,
    setSubjectDeleteBusy,
    setDeleteTarget,
    setDeleteStats,
    setDeleteBusy,
    setDecks,
  });

  const { onExportAnki } = createSubjectExport({
    subject,
    guest,
    runExport,
    setError,
    setNotice,
    setExportWarning,
  });

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
                  <CoverHeroThumb
                    src={subjectCover?.imageUrl}
                    placeholderColor={coverPlaceholderColor(
                      subject?.id ?? subjectId,
                    )}
                    interactive={!guest && !!subject}
                    onChangeCover={openCoverPicker}
                    ariaLabel={
                      subject
                        ? subjectCover
                          ? `Change cover for ${subject.title}`
                          : `Add cover for ${subject.title}`
                        : undefined
                    }
                  />
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
                      onCoverSaved(row);
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
                <MagazineEmptyStage
                  title="Add your first deck"
                  description="Decks hold the cards for one topic inside this subject. Name one, pick a cover, then add material in the hub."
                  boardAriaLabel="Decks"
                  create={{
                    title: "New deck",
                    meta: "Name it, then open the hub",
                    openLabel: "New deck",
                    onCreate: openCreateDeck,
                  }}
                />
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
              openDeckCoverPicker(menuDeck);
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
            onCoverSaved(row);
            setCoverPicker(null);
          }}
          onClear={onClearCover}
        />
      )}
    </Container>
  );
}
