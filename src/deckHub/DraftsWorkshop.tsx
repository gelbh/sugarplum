import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DraftCardEditor from "../components/DraftCardEditor";
import EmptyNext from "../components/EmptyNext";
import type { CardType, JobListItem } from "../api/client";
import { cardFrontPreview, TYPE_LABELS } from "../lib/draftCardModel";
import { navigate } from "../nav/navigate";
import { useDraftsWorkshop } from "./useDraftsWorkshop";

type Props = {
  guest: boolean;
  draftJobs: JobListItem[];
  onAddMoreMaterial: () => void;
  onDraftsChanged?: () => void | Promise<void>;
};

export default function DraftsWorkshop({
  guest,
  draftJobs,
  onAddMoreMaterial,
  onDraftsChanged,
}: Props) {
  const desk = useDraftsWorkshop({ guest, draftJobs, onDraftsChanged });
  const [confirmSafe, setConfirmSafe] = useState(false);

  if (guest) {
    return (
      <Stack spacing={2}>
        <Alert severity="info">
          Draft review needs a signed-in account. Guests can still add local
          cards from paste under Add material.
        </Alert>
        <Button
          variant="text"
          onClick={onAddMoreMaterial}
          sx={{ alignSelf: "flex-start" }}
        >
          Add more material
        </Button>
      </Stack>
    );
  }

  if (desk.loading && desk.drafts.length === 0 && !desk.error) {
    return (
      <Typography color="text.secondary">Loading drafts…</Typography>
    );
  }

  if (desk.error && desk.remaining === 0) {
    return (
      <Stack spacing={2}>
        <Alert severity="error">{desk.error}</Alert>
        <Button
          variant="outlined"
          onClick={() => {
            void desk.reload();
          }}
          sx={{ alignSelf: "flex-start" }}
        >
          Retry
        </Button>
        <Button
          variant="text"
          onClick={onAddMoreMaterial}
          sx={{ alignSelf: "flex-start" }}
        >
          Add more material
        </Button>
      </Stack>
    );
  }

  if (draftJobs.length === 0 || desk.remaining === 0) {
    return (
      <EmptyNext
        title="No draft cards yet"
        body="Add material to generate cards for this deck."
        primary={{ label: "Add material", onClick: onAddMoreMaterial }}
      />
    );
  }

  return (
    <Stack spacing={2} sx={{ minHeight: 0 }}>
      {desk.error ? <Alert severity="error">{desk.error}</Alert> : null}
      {desk.notice ? (
        <Alert severity="success" onClose={() => desk.setNotice(null)}>
          {desk.notice}
        </Alert>
      ) : null}

      <Stack
        direction="row"
        alignItems="baseline"
        justifyContent="space-between"
        spacing={1}
      >
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          {desk.progressLabel}
        </Typography>
        {desk.primaryJobId ? (
          <Link
            href={`/jobs/${encodeURIComponent(desk.primaryJobId)}/drafts`}
            underline="hover"
            color="primary"
            variant="body2"
            fontWeight={600}
            onClick={(ev) => {
              ev.preventDefault();
              navigate(
                `/jobs/${encodeURIComponent(desk.primaryJobId!)}/drafts`,
              );
            }}
          >
            Open full review
          </Link>
        ) : null}
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "minmax(200px, 320px) 1fr" },
          gap: 0,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          overflow: "hidden",
          minHeight: { sm: 360 },
        }}
      >
        <Stack
          component="ul"
          spacing={0}
          divider={<Divider flexItem />}
          sx={{
            m: 0,
            p: 0,
            listStyle: "none",
            borderRight: { sm: 1 },
            borderColor: "divider",
            maxHeight: { xs: 220, sm: 480 },
            overflow: "auto",
          }}
          aria-label="Draft queue"
        >
          {desk.drafts.map((card) => {
            const selected = card.id === desk.selectedId;
            return (
              <Box
                component="li"
                key={card.id}
                sx={{
                  py: 1.5,
                  px: 2,
                  cursor: desk.busy ? "default" : "pointer",
                  bgcolor: selected
                    ? "color-mix(in srgb, var(--sp-plum, #5B2C6F) 10%, transparent)"
                    : "transparent",
                }}
              >
                <Button
                  fullWidth
                  disableRipple
                  disabled={desk.busy}
                  onClick={() => desk.onSelect(card.id)}
                  sx={{
                    display: "block",
                    textAlign: "left",
                    textTransform: "none",
                    color: "inherit",
                    p: 0,
                    minWidth: 0,
                    "&:hover": { bgcolor: "transparent" },
                  }}
                >
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {cardFrontPreview(card)}
                  </Typography>
                  <Chip
                    size="small"
                    label={
                      TYPE_LABELS[card.type as CardType] ?? card.type
                    }
                    sx={{ mt: 0.75, height: 22, fontWeight: 700 }}
                  />
                </Button>
              </Box>
            );
          })}
        </Stack>

        <Box sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0 }}>
          {desk.selected ? (
            <DraftCardEditor
              card={desk.selected}
              disabled={desk.busy}
              onChange={desk.onChange}
            />
          ) : (
            <Typography color="text.secondary">Select a draft</Typography>
          )}
        </Box>
      </Box>

      <Stack
        direction="row"
        spacing={1}
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
      >
        <Button
          variant="outlined"
          disabled={desk.busy || desk.safePreviewCount === 0}
          onClick={() => setConfirmSafe(true)}
        >
          Accept all safe
        </Button>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            variant="outlined"
            disabled={desk.busy || !desk.selected}
            onClick={() => {
              void desk.onSkip();
            }}
          >
            Skip
          </Button>
          <Button
            variant="outlined"
            disabled={desk.busy || !desk.selected || !desk.dirty}
            onClick={() => {
              void desk.onSave();
            }}
          >
            Save
          </Button>
          <Button
            variant="contained"
            disabled={desk.busy || !desk.selected}
            onClick={() => {
              void desk.onAccept();
            }}
          >
            Accept
          </Button>
        </Stack>
      </Stack>

      <Button
        variant="text"
        onClick={onAddMoreMaterial}
        sx={{ alignSelf: "flex-start" }}
      >
        Add more material
      </Button>

      <Dialog
        open={confirmSafe}
        onClose={() => !desk.busy && setConfirmSafe(false)}
      >
        <DialogTitle>Accept all safe drafts?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Accept {desk.safePreviewCount} quality-gated draft
            {desk.safePreviewCount === 1 ? "" : "s"} into study
            {desk.unsafePreviewCount > 0
              ? ` and leave ${desk.unsafePreviewCount} for review`
              : ""}
            ? Counts are a preview; the server re-checks before accepting.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmSafe(false)}
            disabled={desk.busy}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={desk.busy}
            autoFocus
            onClick={() => {
              setConfirmSafe(false);
              void desk.onAcceptAllSafe();
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
