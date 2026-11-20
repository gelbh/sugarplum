import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { useEffect, useRef, useState } from "react";
import type { CardDraftView } from "../api/client";
import {
  mcqDraftFromCard,
  type DraftEditorChange,
} from "../draftReview/draftCardModel";
import {
  MCQ_MAX,
  MCQ_MIN,
  mcqBack,
  withMcqCorrect,
  withMcqOptionAdded,
  withMcqOptionRemoved,
  withMcqOptionText,
  type McqDraft,
} from "../draftReview/mcqDraftEdit";
import { FaceOverline, StudyCardPlate } from "./CardFace";
import {
  FACE_BODY_SX,
  FACE_DISABLED_SX,
  FACE_SANS,
  FACE_SX,
} from "./studyFaceSx";

const FIELD_SX = {
  fontFamily: FACE_SANS,
  color: "inherit",
  px: 1,
  borderRadius: 1,
  border: "1px solid color-mix(in srgb, var(--sp-stage-bg) 18%, transparent)",
} as const;

export function ReviewMcqFace({
  card,
  disabled,
  onChange,
}: {
  card: CardDraftView;
  disabled: boolean;
  onChange: (next: DraftEditorChange) => void;
}) {
  const front = typeof card.front === "string" ? card.front : "";
  const options = mcqDraftFromCard(card).options;
  const [correctIndex, setCorrectIndex] = useState(
    () => mcqDraftFromCard(card).correctIndex,
  );
  useEffect(() => {
    setCorrectIndex(mcqDraftFromCard(card).correctIndex);
  }, [card.id]);
  useEffect(() => {
    setCorrectIndex((i) =>
      Math.min(Math.max(0, i), Math.max(0, options.length - 1)),
    );
  }, [options.length]);
  const draft: McqDraft = { options, correctIndex };
  const rowKeys = useRef<string[]>([]);
  while (rowKeys.current.length < draft.options.length) {
    rowKeys.current.push(`${rowKeys.current.length}:${Math.random()}`);
  }

  const emit = (next: McqDraft, nextFront = front) => {
    setCorrectIndex(next.correctIndex);
    onChange({
      front: nextFront,
      back: mcqBack(next),
      type: "mcq",
      options: next.options,
    });
  };

  return (
    <StudyCardPlate>
      <Paper
        elevation={0}
        className="sp-playing-card"
        sx={{ ...FACE_SX, ...FACE_DISABLED_SX, height: "100%" }}
      >
        <FaceOverline label="Front" />
        <Box data-card-face-content sx={FACE_BODY_SX}>
          <InputBase
            multiline
            fullWidth
            value={front}
            placeholder="Question"
            disabled={disabled}
            onChange={(e) => emit(draft, e.target.value)}
            inputProps={{ "aria-label": "Question" }}
            sx={{
              fontFamily: FACE_SANS,
              fontSize: { xs: "1.05rem", sm: "1.2rem" },
              color: "inherit",
              mb: 2,
              flexShrink: 0,
            }}
          />
          <Stack spacing={1}>
            {draft.options.map((option, index) => (
              <Stack
                key={rowKeys.current[index]}
                direction="row"
                spacing={0.5}
                sx={{
                  alignItems: "center"
                }}
              >
                <Radio
                  size="small"
                  checked={draft.correctIndex === index}
                  disabled={disabled}
                  onChange={() => emit(withMcqCorrect(draft, index))}
                  sx={{
                    color: "inherit",
                    "&.Mui-checked": { color: "var(--sp-plum)" },
                    "&&.Mui-disabled.Mui-checked": { color: "var(--sp-plum)" },
                  }}
                  slotProps={{
                    input: { "aria-label": `Correct choice ${index + 1}` }
                  }}
                />
                {draft.correctIndex === index ? (
                  <Typography component="span" variant="caption">
                    Correct
                  </Typography>
                ) : null}
                <InputBase
                  fullWidth
                  value={option}
                  placeholder={`Choice ${index + 1}`}
                  disabled={disabled}
                  onChange={(e) =>
                    emit(withMcqOptionText(draft, index, e.target.value))
                  }
                  inputProps={{ "aria-label": `Choice ${index + 1}` }}
                  sx={FIELD_SX}
                />
                <IconButton
                  size="small"
                  aria-label={`Remove choice ${index + 1}`}
                  disabled={disabled || draft.options.length <= MCQ_MIN}
                  onClick={() => {
                    rowKeys.current.splice(index, 1);
                    emit(withMcqOptionRemoved(draft, index));
                  }}
                  sx={{ color: "inherit" }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
          <Button
            size="small"
            startIcon={<AddIcon />}
            disabled={disabled || draft.options.length >= MCQ_MAX}
            onClick={() => emit(withMcqOptionAdded(draft))}
            sx={{
              alignSelf: "flex-start",
              mt: 1,
              color: "inherit",
              fontFamily: FACE_SANS,
              textTransform: "none",
            }}
          >
            Add choice
          </Button>
        </Box>
      </Paper>
    </StudyCardPlate>
  );
}
