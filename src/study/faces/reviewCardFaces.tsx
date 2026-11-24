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
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  mediaUrl,
  type CardDraftView,
  type CardType,
  type OcclusionFrontView,
} from "../../api/client";
import {
  CLOZE_EXTRA_LABEL,
  clozeSpoken,
  revealClozeFront,
} from "./clozeFormat";
import {
  backAnswer,
  isOcclusionFront,
  type DraftEditorChange,
} from "../../draftReview/kernel";
import { FlipCardPlate, StudyCardPlate } from "./cardPlates";
import { FaceOverline } from "./faceOverline";
import ClozePrompt from "./ClozePrompt";
import ClozeReveal from "./ClozeReveal";
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

export type OcclusionRegionEditorSlot = (args: {
  front: OcclusionFrontView;
  onChange: (next: {
    front: OcclusionFrontView;
    back: { answer: string };
  }) => void;
}) => ReactNode;

type OcclusionFaceProps = FaceProps & {
  /** Routes compose OcclusionRegionEditor from draftReview. */
  renderOcclusionRegionEditor: OcclusionRegionEditorSlot;
};

function EditableText({
  label,
  value,
  spoken,
  visual,
  editing,
  disabled,
  textSx,
  onEdit,
  onDone,
  onChange,
}: {
  label: string;
  value: string;
  spoken: string;
  visual?: ReactNode;
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
        disabled={disabled}
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
      aria-label={`Edit ${label}: ${spoken || "empty"}`}
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
        "&:hover": disabled
          ? undefined
          : {
              bgcolor: "color-mix(in srgb, var(--sp-stage-bg) 5%, transparent)",
            },
        "&:focus-visible": {
          outline: "2px solid currentColor",
          outlineOffset: 2,
        },
      }}
    >
      <Typography
        component="p"
        sx={{ ...textSx, m: 0, ...(spoken ? null : { opacity: 0.45 }) }}
      >
        {visual ?? (spoken || label)}
      </Typography>
    </Box>
  );
}

export function TextReviewFace({ card, disabled, onChange }: FaceProps) {
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState<"front" | "back" | null>(null);
  const type = card.type as CardType;
  const frontText = typeof card.front === "string" ? card.front : "";
  const backText = backAnswer(card.back);
  const isCloze = type === "cloze";
  const imageKey = card.media_r2_keys?.[0];

  const showBackRef = useRef<HTMLButtonElement>(null);
  const showFrontRef = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  const field = (name: "front" | "back") => ({
    editing: editing === name,
    disabled,
    onEdit: () => setEditing(name),
    onDone: () => setEditing(null),
  });
  const flip = (next: boolean) => {
    moved.current = true;
    setEditing(null);
    setRevealed(next);
  };
  useEffect(() => {
    if (!moved.current) return;
    const target = revealed ? showFrontRef.current : showBackRef.current;
    target?.focus({ preventScroll: true });
  }, [revealed]);

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
              spoken={isCloze ? clozeSpoken(frontText) : frontText}
              visual={
                isCloze && frontText ? (
                  <ClozePrompt front={frontText} />
                ) : undefined
              }
              textSx={FACE_PROMPT_TEXT_SX}
              onChange={(front) => onChange({ front, back: backText, type })}
              {...field("front")}
            />
            {isCloze ? (
              <Typography component="p" sx={FACE_HINT_TEXT_SX}>
                Blanks show as a line when you study
              </Typography>
            ) : null}
          </Box>
          <Box sx={FOOTER_SX}>
            <Button
              ref={showBackRef}
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
            {isCloze && frontText.trim() ? (
              <Typography component="p" sx={FACE_ANSWER_TEXT_SX}>
                <ClozeReveal front={frontText} />
              </Typography>
            ) : null}
            <EditableText
              label={isCloze ? CLOZE_EXTRA_LABEL : "Back"}
              value={backText}
              spoken={
                isCloze
                  ? [revealClozeFront(frontText), backText]
                      .filter((part) => part.trim())
                      .join(". ")
                  : backText
              }
              textSx={isCloze ? FACE_HINT_TEXT_SX : FACE_ANSWER_TEXT_SX}
              onChange={(back) => onChange({ front: frontText, back, type })}
              {...field("back")}
            />
          </Box>
          <Box sx={FOOTER_SX}>
            <Button
              ref={showFrontRef}
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

export function OcclusionReviewFace({
  card,
  disabled,
  onChange,
  renderOcclusionRegionEditor,
}: OcclusionFaceProps) {
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
            {draft
              ? renderOcclusionRegionEditor({
                  front: draft.front,
                  onChange: setDraft,
                })
              : null}
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
