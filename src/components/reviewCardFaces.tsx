import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import InputBase from "@mui/material/InputBase";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import { useState } from "react";
import {
  mediaUrl,
  type CardDraftView,
  type CardType,
  type OcclusionFrontView,
} from "../api/client";
import {
  blankClozeFront,
  CLOZE_EXTRA_LABEL,
  extractClozeAnswer,
} from "../lib/clozeFormat";
import {
  backAnswer,
  isOcclusionFront,
  type DraftEditorChange,
} from "../lib/draftCardModel";
import { FaceOverline, FlipCardPlate, StudyCardPlate } from "./CardFace";
import OcclusionRegionEditor from "./OcclusionRegionEditor";
import {
  FACE_ANSWER_TEXT_SX,
  FACE_BODY_SX,
  FACE_DISABLED_SX,
  FACE_FRONT_ECHO_SX,
  FACE_HINT_TEXT_SX,
  FACE_MEDIA_SX,
  FACE_OUTLINE_BUTTON_SX,
  FACE_PROMPT_TEXT_SX,
  FACE_SX,
  PROMPT_SX,
} from "./studyFaceSx";

// Never shrink below the text, so long drafts scroll inside the face body.
const CONTENT_SX = { ...PROMPT_SX, flex: "1 0 auto" } as const;
const FOOTER_SX = { pt: 2, width: "100%", flexShrink: 0 } as const;

type FaceProps = {
  card: CardDraftView;
  disabled: boolean;
  onChange: (next: DraftEditorChange) => void;
};

/** Read mode looks like Study text; tap turns it into an in-face input. */
function EditableText({
  label,
  value,
  display,
  editing,
  disabled,
  textSx,
  onEdit,
  onDone,
  onChange,
}: {
  label: string;
  value: string;
  display: string;
  editing: boolean;
  disabled: boolean;
  textSx: Record<string, unknown>;
  onEdit: () => void;
  onDone: () => void;
  onChange: (value: string) => void;
}) {
  if (editing) {
    return (
      <InputBase
        autoFocus
        multiline
        fullWidth
        value={value}
        placeholder={label}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onDone}
        onKeyDown={(e) => {
          if (e.key === "Escape") (e.target as HTMLElement).blur();
        }}
        inputProps={{ "aria-label": label }}
        sx={{ ...textSx, width: "100%", "& textarea": { textAlign: "center" } }}
      />
    );
  }
  return (
    <Box
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Edit ${label}: ${display || "empty"}`}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onEdit();
      }}
      onKeyDown={(e) => {
        if (disabled || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        onEdit();
      }}
      sx={{
        width: "100%",
        px: 1,
        borderRadius: 1,
        cursor: disabled ? "default" : "text",
        "&:hover": disabled ? undefined : { bgcolor: "rgba(30, 13, 27, 0.05)" },
        "&:focus-visible": { outline: "2px solid currentColor", outlineOffset: 2 },
      }}
    >
      <Typography
        component="p"
        sx={{ ...textSx, m: 0, ...(display ? null : { opacity: 0.45 }) }}
      >
        {display || label}
      </Typography>
    </Box>
  );
}

/** Qa / cloze / image_label / diagram: Study flip faces with tap-to-edit text. */
export function TextReviewFace({ card, disabled, onChange }: FaceProps) {
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState<"front" | "back" | null>(null);
  const type = card.type as CardType;
  const frontText = typeof card.front === "string" ? card.front : "";
  const backText = backAnswer(card.back);
  const isCloze = type === "cloze";
  const imageKey = card.media_r2_keys?.[0];

  const field = (name: "front" | "back") => ({
    editing: editing === name,
    disabled,
    onEdit: () => setEditing(name),
    onDone: () => setEditing(null),
  });
  const flip = (next: boolean) => {
    setEditing(null);
    setRevealed(next);
  };

  return (
    <FlipCardPlate
      revealed={revealed}
      faceSx={FACE_DISABLED_SX}
      front={
        <Box data-card-face-content sx={FACE_BODY_SX}>
          <Box sx={CONTENT_SX}>
            {imageKey ? (
              <Box
                component="img"
                src={mediaUrl(imageKey)}
                alt="Card media"
                draggable={false}
                sx={FACE_MEDIA_SX}
              />
            ) : null}
            <EditableText
              label="Front"
              value={frontText}
              display={isCloze ? blankClozeFront(frontText) : frontText}
              textSx={FACE_PROMPT_TEXT_SX}
              onChange={(front) => onChange({ front, back: backText, type })}
              {...field("front")}
            />
            {isCloze ? (
              <Typography component="p" sx={FACE_HINT_TEXT_SX}>
                Blanks show as […] when you study
              </Typography>
            ) : null}
          </Box>
          <Box sx={FOOTER_SX}>
            <Button
              variant="outlined"
              disabled={disabled}
              onClick={() => flip(true)}
              sx={FACE_OUTLINE_BUTTON_SX}
            >
              Show back
            </Button>
          </Box>
        </Box>
      }
      back={
        <Box data-card-face-content sx={FACE_BODY_SX}>
          {!isCloze && frontText ? (
            <Typography component="p" sx={FACE_FRONT_ECHO_SX}>
              {frontText}
            </Typography>
          ) : null}
          <Box sx={CONTENT_SX}>
            {isCloze ? (
              <Typography component="p" sx={FACE_ANSWER_TEXT_SX}>
                {extractClozeAnswer(frontText) ?? ""}
              </Typography>
            ) : null}
            <EditableText
              label={isCloze ? CLOZE_EXTRA_LABEL : "Back"}
              value={backText}
              display={backText}
              textSx={isCloze ? FACE_HINT_TEXT_SX : FACE_ANSWER_TEXT_SX}
              onChange={(back) => onChange({ front: frontText, back, type })}
              {...field("back")}
            />
          </Box>
          <Box sx={FOOTER_SX}>
            <Button
              variant="outlined"
              disabled={disabled}
              onClick={() => flip(false)}
              sx={FACE_OUTLINE_BUTTON_SX}
            >
              Show front
            </Button>
          </Box>
        </Box>
      }
    />
  );
}

/** Occlusion draft front: image, prompt and a dialog to edit hidden regions. */
export function OcclusionReviewFace({ card, disabled, onChange }: FaceProps) {
  const fullScreen = useMediaQuery((theme: Theme) =>
    theme.breakpoints.down("sm"),
  );
  const [draft, setDraft] = useState<{
    front: OcclusionFrontView;
    back: { answer: string };
  } | null>(null);
  if (!isOcclusionFront(card.front)) return null;
  const front = card.front;
  const count = front.regions.length;

  return (
    <StudyCardPlate>
      <Paper
        elevation={0}
        className="sp-playing-card"
        sx={{ ...FACE_SX, ...FACE_DISABLED_SX, height: "100%" }}
      >
        <FaceOverline label="Front" />
        <Box data-card-face-content sx={FACE_BODY_SX}>
          <Box sx={CONTENT_SX}>
            <Box
              component="img"
              src={mediaUrl(front.image_key)}
              alt="Card media"
              draggable={false}
              sx={FACE_MEDIA_SX}
            />
            {front.prompt ? (
              <Typography component="p" sx={FACE_PROMPT_TEXT_SX}>
                {front.prompt}
              </Typography>
            ) : null}
            <Typography component="p" sx={FACE_HINT_TEXT_SX}>
              {count} hidden {count === 1 ? "region" : "regions"}
            </Typography>
          </Box>
          <Box sx={FOOTER_SX}>
            <Button
              variant="outlined"
              disabled={disabled}
              onClick={() =>
                setDraft({ front, back: { answer: backAnswer(card.back) } })
              }
              sx={FACE_OUTLINE_BUTTON_SX}
            >
              Edit regions
            </Button>
          </Box>
        </Box>
        <Dialog
          open={draft !== null}
          onClose={() => setDraft(null)}
          fullScreen={fullScreen}
          fullWidth
          maxWidth="md"
        >
          <DialogTitle>Edit regions</DialogTitle>
          <DialogContent>
            {draft ? (
              <OcclusionRegionEditor front={draft.front} onChange={setDraft} />
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={() => {
                if (draft) onChange({ ...draft, type: "occlusion" });
                setDraft(null);
              }}
            >
              Done
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </StudyCardPlate>
  );
}
