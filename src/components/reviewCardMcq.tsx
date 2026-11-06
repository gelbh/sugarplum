import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import Stack from "@mui/material/Stack";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import type { CardDraftView } from "../api/client";
import {
  mcqDraftFromCard,
  type DraftEditorChange,
} from "../lib/draftCardModel";
import {
  MCQ_MAX,
  MCQ_MIN,
  withMcqCorrect,
  withMcqOptionAdded,
  withMcqOptionRemoved,
  withMcqOptionText,
  type McqDraft,
} from "../lib/mcqDraftEdit";
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
  border: "1px solid rgba(30, 13, 27, 0.18)",
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
  const draft = mcqDraftFromCard(card);

  const emit = (next: McqDraft, nextFront = front) =>
    onChange({
      front: nextFront,
      back: next.back,
      type: "mcq",
      options: next.options,
    });

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
                key={index}
                direction="row"
                alignItems="center"
                spacing={0.5}
              >
                <Radio
                  size="small"
                  checked={draft.back === option}
                  disabled={disabled}
                  onChange={() => emit(withMcqCorrect(draft, index))}
                  inputProps={{ "aria-label": `Correct choice ${index + 1}` }}
                  sx={{
                    color: "inherit",
                    "&.Mui-checked": { color: "var(--sp-plum)" },
                  }}
                />
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
                  onClick={() => emit(withMcqOptionRemoved(draft, index))}
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
