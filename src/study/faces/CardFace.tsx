import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import {
  useEffect,
  useState,
  type MouseEvent,
  type Ref,
} from "react";
import { type StudyRating } from "../../api/client";
import {
  clozeExtraSubtitle,
  clozeSpoken,
  extractClozeAnswer,
  extractClozeAnswers,
  revealClozeFront,
} from "./clozeFormat";
import { type OcclusionMaskBox } from "../../deckHub/kernel";
import { CardFaceMcqBody } from "./cardFaceMcq";
import { FlipCardPlate, StudyCardPlate } from "./cardPlates";
import ClozePrompt from "./ClozePrompt";
import ClozeReveal from "./ClozeReveal";
import KeyChip from "./KeyChip";
import { StudyNotesButton } from "../notes/StudyNotesButton";
import { StudyMedia } from "./studyMedia";
import {
  FACE_ANSWER_TEXT_SX,
  FACE_BODY_SX,
  FACE_FRONT_ECHO_SX,
  FACE_HINT_TEXT_SX,
  FACE_OUTLINE_BUTTON_SX,
  FACE_PROMPT_TEXT_SX,
  FACE_SANS,
  PROMPT_SX,
} from "./studyFaceSx";

export type { OcclusionMaskBox };

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
  const [maskScrollTop, setMaskScrollTop] = useState<number | null>(null);
  const notesTrailing =
    notesAvailable && onOpenNotes ? (
      <StudyNotesButton onOpenNotes={onOpenNotes} />
    ) : undefined;
  const occlusionScrollKey = occlusion
    ? `${occlusion.imageKey}:${occlusion.mask.x}:${occlusion.mask.y}:${occlusion.mask.w}:${occlusion.mask.h}`
    : "";

  useEffect(() => {
    // Sentinel: skip restore until StudyMedia centers the new mask.
    setMaskScrollTop(null);
  }, [occlusionScrollKey]);

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
          overlineTrailing={notesTrailing}
        />
      </StudyCardPlate>
    );
  }

  const isCloze = type === "cloze";
  const spokenFront = isCloze ? clozeSpoken(front) : front;
  const clozeExtra = isCloze ? clozeExtraSubtitle(back) : null;
  const clozeAnswers = isCloze ? extractClozeAnswers(front) : [];
  const answerText = isCloze
    ? revealClozeFront(front) ||
      clozeAnswers.join(" · ") ||
      (extractClozeAnswer(front) ?? "")
    : back;
  const imageKey = occlusion?.imageKey ?? mediaR2Keys[0];
  const canReveal = !revealed && !disabled;
  const canFlipBack = revealed && !disabled;
  const faceBodySx = occlusion
    ? { ...FACE_BODY_SX, overflowY: "hidden" as const }
    : FACE_BODY_SX;
  const promptSx = occlusion
    ? { ...PROMPT_SX, justifyContent: "flex-start" as const }
    : PROMPT_SX;

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
      plateSx={{
        cursor: canReveal || canFlipBack ? "pointer" : "default",
        ...(occlusion
          ? {
              // Absolute faces need a definite plate height (faceMotionSx).
              // Unset class .sp-playing-card aspect-ratio so media-first height wins.
              aspectRatio: "unset",
              height: "min(85vh, 640px)",
              maxHeight: "min(100%, 85vh)",
              width: "min(100%, 420px)",
              maxWidth: "min(100%, 420px)",
            }
          : {}),
      }}
      overlineTrailing={notesTrailing}
      front={
        <Box data-card-face-content sx={faceBodySx}>
          <Box sx={promptSx}>
            {imageKey ? (
              <StudyMedia
                imageKey={imageKey}
                mask={occlusion?.mask}
                masked={!!occlusion}
                faceActive={!revealed}
                scrollTop={occlusion ? maskScrollTop : undefined}
                onScrollTopChange={occlusion ? setMaskScrollTop : undefined}
              />
            ) : null}
            {spokenFront ? (
              <Typography
                component="p"
                sx={{
                  ...FACE_PROMPT_TEXT_SX,
                  ...(occlusion
                    ? {
                        flex: "0 1 auto",
                        minHeight: 0,
                        maxHeight: "28%",
                        overflowY: "auto",
                      }
                    : {}),
                }}
              >
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
        <Box data-card-face-content sx={faceBodySx}>
          {occlusion && imageKey ? (
            <StudyMedia
              imageKey={imageKey}
              mask={occlusion.mask}
              masked={false}
              faceActive={revealed}
              scrollTop={maskScrollTop}
              onScrollTopChange={setMaskScrollTop}
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
              ...promptSx,
              ...(occlusion
                ? {
                    flex: "0 1 auto",
                    minHeight: 0,
                    maxHeight: "30%",
                    overflowY: "auto",
                  }
                : {}),
              outline: "none",
              WebkitTapHighlightColor: "transparent",
              "&:focus": { outline: "none" },
              "&:focus-visible": { outline: "none" },
            }}
          >
            <Typography component="p" sx={FACE_ANSWER_TEXT_SX}>
              {isCloze && front.trim() ? (
                <ClozeReveal front={front} />
              ) : (
                answerText
              )}
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
