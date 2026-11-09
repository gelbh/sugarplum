import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { MouseEvent, ReactNode, Ref } from "react";
import { mediaUrl, type StudyRating } from "../api/client";
import {
  clozeExtraSubtitle,
  clozeSpoken,
  extractClozeAnswer,
} from "../lib/clozeFormat";
import { CardFaceMcqBody } from "./cardFaceMcq";
import ClozePrompt from "./ClozePrompt";
import { FaceOverline } from "./faceOverline";
import KeyChip from "./KeyChip";
import {
  CARD_COLUMN_SX,
  FACE_ANSWER_TEXT_SX,
  FACE_BODY_SX,
  FACE_FRONT_ECHO_SX,
  FACE_HINT_TEXT_SX,
  FACE_MEDIA_SX,
  FACE_OUTLINE_BUTTON_SX,
  FACE_PROMPT_TEXT_SX,
  FACE_SANS,
  PROMPT_SX,
  faceMotionSx,
} from "./studyFaceSx";

/** Normalized 0–1 hide_one box over the study image until reveal. */
export type OcclusionMaskBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OcclusionStudyFace = {
  imageKey: string;
  mask: OcclusionMaskBox;
};

type Props = {
  front: string;
  back: string;
  type?: string;
  revealed: boolean;
  onReveal: () => void;
  /** Flip from answer back to the question face. */
  onFlipBack: () => void;
  disabled?: boolean;
  mediaR2Keys?: string[];
  /** When set, front masks this region; back shows the same image unmasked. */
  occlusion?: OcclusionStudyFace;
  /** Focus target for the answer face after reveal. */
  answerFocusRef?: Ref<HTMLElement | null>;
  /** Focus target for Show answer after grading / flip-back. */
  showAnswerRef?: Ref<HTMLButtonElement | null>;
  /** Required when `type === "mcq"`. */
  cardId?: string;
  options?: string[];
  onGrade?: (rating: StudyRating) => boolean | Promise<boolean>;
  notesAvailable?: boolean;
  onOpenNotes?: () => void;
};

export { FaceOverline } from "./faceOverline";

/** Shared host + playing-card plate (MCQ and flip faces). */
export function StudyCardPlate({
  children,
  perspective,
  onPlateClick,
  plateSx,
}: {
  children: ReactNode;
  perspective?: string;
  onPlateClick?: () => void;
  plateSx?: Record<string, unknown>;
}) {
  return (
    <Box
      sx={{
        ...CARD_COLUMN_SX,
        perspective,
        maxHeight: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Box
        className="sp-playing-card"
        onClick={onPlateClick}
        sx={{
          position: "relative",
          width: "auto",
          maxWidth: "min(100%, 360px)",
          maxHeight: "100%",
          height: "min(100%, 504px)",
          aspectRatio: "var(--sp-card-aspect)",
          // Flex item + aspect-ratio: auto min-width is height-derived and beats max-width.
          minWidth: 0,
          borderRadius: 2,
          bgcolor: "transparent",
          ...plateSx,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export function FlipCardPlate({
  revealed,
  front,
  back,
  onPlateClick,
  plateSx,
  faceSx,
  notesAvailable,
  onOpenNotes,
}: {
  revealed: boolean;
  front: ReactNode;
  back: ReactNode;
  onPlateClick?: () => void;
  plateSx?: Record<string, unknown>;
  faceSx?: Record<string, unknown>;
  notesAvailable?: boolean;
  onOpenNotes?: () => void;
}) {
  return (
    <StudyCardPlate
      perspective="1000px"
      onPlateClick={onPlateClick}
      plateSx={{
        transformStyle: "preserve-3d",
        transition: "transform 0.45s ease",
        transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
        ...plateSx,
        "@media (prefers-reduced-motion: reduce)": {
          transform: "none",
          transition: "none",
          minHeight: 280,
          maxHeight: "100%",
        },
      }}
    >
      <Paper
        elevation={0}
        aria-hidden={revealed}
        inert={revealed || undefined}
        className="sp-playing-card"
        sx={{ ...faceMotionSx(false, !revealed), ...faceSx }}
      >
        <FaceOverline
          label="Front"
          notesAvailable={notesAvailable}
          onOpenNotes={onOpenNotes}
        />
        {front}
      </Paper>

      <Paper
        elevation={0}
        aria-hidden={!revealed}
        inert={!revealed || undefined}
        className="sp-playing-card"
        sx={{ ...faceMotionSx(true, revealed), ...faceSx }}
      >
        <FaceOverline
          label="Back"
          notesAvailable={notesAvailable}
          onOpenNotes={onOpenNotes}
        />
        {back}
      </Paper>
    </StudyCardPlate>
  );
}

/** Hide_one stage: editor contract (scroll shell + natural-aspect img, no contain letterbox). */
function StudyMedia({
  imageKey,
  mask,
  masked,
}: {
  imageKey: string;
  mask?: OcclusionMaskBox;
  masked: boolean;
}) {
  if (mask) {
    return (
      <Box
        sx={{
          maxHeight: "42vh",
          overflow: "auto",
          width: "100%",
          mb: 2,
          borderRadius: 1,
        }}
      >
        <Box
          sx={{
            position: "relative",
            width: "100%",
            lineHeight: 0,
          }}
        >
          <Box
            component="img"
            src={mediaUrl(imageKey)}
            alt="Card media"
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            sx={{
              display: "block",
              width: "100%",
              height: "auto",
              userSelect: "none",
            }}
          />
          <Box
            aria-hidden
            {...(masked
              ? { "data-occlusion-mask": true }
              : { "data-occlusion-reveal-outline": true })}
            sx={{
              position: "absolute",
              left: `${mask.x * 100}%`,
              top: `${mask.y * 100}%`,
              width: `${mask.w * 100}%`,
              height: `${mask.h * 100}%`,
              borderRadius: "4px",
              pointerEvents: "none",
              ...(masked
                ? {
                    bgcolor:
                      "color-mix(in srgb, var(--sp-stage-bg) 92%, transparent)",
                    border: "1.5px solid",
                    borderColor: "secondary.main",
                    boxShadow: "0 2px 12px var(--sp-lamp-glow)",
                  }
                : {
                    border: "1.5px solid",
                    borderColor: "secondary.main",
                    opacity: 0.85,
                    boxShadow:
                      "0 0 0 1px color-mix(in srgb, var(--sp-stage-bg) 35%, transparent)",
                  }),
            }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={mediaUrl(imageKey)}
      alt="Card media"
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      sx={FACE_MEDIA_SX}
    />
  );
}

/** Physical study card: 3D Y-flip, or instant swap when prefers-reduced-motion. */
export default function CardFace({
  front,
  back,
  type,
  revealed,
  onReveal,
  onFlipBack,
  disabled,
  mediaR2Keys = [],
  occlusion,
  answerFocusRef,
  showAnswerRef,
  cardId,
  options,
  onGrade,
  notesAvailable,
  onOpenNotes,
}: Props) {
  if (type === "mcq") {
    if (!cardId || !onGrade) return null;
    return (
      <StudyCardPlate>
        <CardFaceMcqBody
          cardId={cardId}
          front={front}
          back={back}
          options={options}
          disabled={disabled}
          onGrade={onGrade}
          notesAvailable={notesAvailable}
          onOpenNotes={onOpenNotes}
        />
      </StudyCardPlate>
    );
  }

  const isCloze = type === "cloze";
  const spokenFront = isCloze ? clozeSpoken(front) : front;
  const clozeExtra = isCloze ? clozeExtraSubtitle(back) : null;
  const answerText = isCloze ? (extractClozeAnswer(front) ?? "") : back;
  const imageKey = occlusion?.imageKey ?? mediaR2Keys[0];
  const canReveal = !revealed && !disabled;
  const canFlipBack = revealed && !disabled;

  const reveal = () => {
    if (!canReveal) return;
    onReveal();
  };

  const flipBack = () => {
    if (!canFlipBack) return;
    onFlipBack();
  };

  const onShowAnswerClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    reveal();
  };

  const onShowQuestionClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    flipBack();
  };

  return (
    <FlipCardPlate
      revealed={revealed}
      onPlateClick={canReveal ? reveal : canFlipBack ? flipBack : undefined}
      plateSx={{ cursor: canReveal || canFlipBack ? "pointer" : "default" }}
      notesAvailable={notesAvailable}
      onOpenNotes={onOpenNotes}
      front={
        <Box data-card-face-content sx={FACE_BODY_SX}>
          <Box sx={PROMPT_SX}>
            {imageKey ? (
              <StudyMedia
                imageKey={imageKey}
                mask={occlusion?.mask}
                masked={!!occlusion}
              />
            ) : null}
            {spokenFront ? (
              <Typography component="p" sx={FACE_PROMPT_TEXT_SX}>
                {isCloze ? <ClozePrompt front={front} /> : spokenFront}
              </Typography>
            ) : null}
          </Box>
          {!revealed ? (
            <Box sx={{ pt: 2, width: "100%", flexShrink: 0 }}>
              <Button
                ref={showAnswerRef}
                variant="contained"
                onClick={onShowAnswerClick}
                disabled={!!disabled}
                aria-keyshortcuts="Space"
                sx={{ fontFamily: FACE_SANS, minHeight: 44 }}
              >
                Show answer
                <KeyChip label="Space" ml={1} />
              </Button>
            </Box>
          ) : null}
        </Box>
      }
      back={
        <Box data-card-face-content sx={FACE_BODY_SX}>
          {occlusion && imageKey ? (
            <StudyMedia
              imageKey={imageKey}
              mask={occlusion.mask}
              masked={false}
            />
          ) : !isCloze && front ? (
            <Typography component="p" sx={FACE_FRONT_ECHO_SX}>
              {front}
            </Typography>
          ) : null}
          <Box
            ref={answerFocusRef}
            tabIndex={revealed ? -1 : undefined}
            sx={{
              ...PROMPT_SX,
              outline: "none",
              WebkitTapHighlightColor: "transparent",
              "&:focus": { outline: "none" },
              "&:focus-visible": { outline: "none" },
            }}
          >
            <Typography component="p" sx={FACE_ANSWER_TEXT_SX}>
              {answerText}
            </Typography>
            {clozeExtra ? (
              <Typography component="p" sx={FACE_HINT_TEXT_SX}>
                {clozeExtra}
              </Typography>
            ) : null}
          </Box>
          {revealed ? (
            <Box sx={{ pt: 2, width: "100%", flexShrink: 0 }}>
              <Button
                variant="outlined"
                onClick={onShowQuestionClick}
                disabled={!!disabled}
                aria-keyshortcuts="Space"
                sx={FACE_OUTLINE_BUTTON_SX}
              >
                Show question
                <KeyChip label="Space" ml={1} />
              </Button>
            </Box>
          ) : null}
        </Box>
      }
    />
  );
}
