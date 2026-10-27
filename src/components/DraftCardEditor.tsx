import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { mediaUrl, type CardDraftView } from "../api/client";
import {
  blankClozeFront,
  extractClozeAnswer,
} from "../lib/clozeFormat";

export type DraftEditorChange = Pick<
  CardDraftView,
  "front" | "back" | "type" | "options"
>;

export type DraftCardEditorProps = {
  card: CardDraftView;
  disabled?: boolean;
  onChange: (next: DraftEditorChange) => void;
};

type CardType = "qa" | "cloze" | "image_label" | "diagram" | "mcq";

const MCQ_MIN = 3;
const MCQ_MAX = 5;

function defaultMcqOptions(card: CardDraftView): string[] {
  if (
    card.options &&
    card.options.length >= MCQ_MIN &&
    card.options.length <= MCQ_MAX
  ) {
    return [...card.options];
  }
  const back = card.back.trim();
  if (back) {
    return [back, "", ""];
  }
  return ["", "", ""];
}

function onTypeChange(
  card: CardDraftView,
  type: CardType,
  onChange: (next: DraftEditorChange) => void,
) {
  if (type === "mcq") {
    const options = defaultMcqOptions(card);
    const back =
      card.back.trim() && options.includes(card.back.trim())
        ? card.back.trim()
        : (options.find((o) => o.trim()) ?? options[0] ?? "");
    onChange({
      front: card.front,
      back,
      type,
      options,
    });
    return;
  }
  onChange({
    front: card.front,
    back: card.back,
    type,
  });
}

/** Edit front / back / type for a draft card before accept. */
export default function DraftCardEditor({
  card,
  disabled = false,
  onChange,
}: DraftCardEditorProps) {
  const imageKey = card.media_r2_keys?.[0];
  const isCloze = card.type === "cloze";
  const isMcq = card.type === "mcq";
  const mcqOptions = isMcq ? (card.options ?? defaultMcqOptions(card)) : [];
  const clozeAnswer = isCloze
    ? (extractClozeAnswer(card.front) ?? (card.back.trim() || null))
    : null;

  function patch(partial: Partial<DraftEditorChange>) {
    onChange({
      front: partial.front ?? card.front,
      back: partial.back ?? card.back,
      type: partial.type ?? card.type,
      ...(partial.options !== undefined
        ? { options: partial.options }
        : isMcq
          ? { options: mcqOptions }
          : {}),
    });
  }

  function updateMcqOption(index: number, value: string) {
    const options = [...mcqOptions];
    const wasCorrect = card.back === options[index];
    options[index] = value;
    patch({
      options,
      back: wasCorrect ? value : card.back,
    });
  }

  function setMcqCorrect(index: number) {
    patch({ back: mcqOptions[index] ?? "" });
  }

  function addMcqOption() {
    if (mcqOptions.length >= MCQ_MAX) return;
    patch({ options: [...mcqOptions, ""] });
  }

  function removeMcqOption(index: number) {
    if (mcqOptions.length <= MCQ_MIN) return;
    const removed = mcqOptions[index];
    const options = mcqOptions.filter((_, i) => i !== index);
    let back = card.back;
    if (back === removed) {
      back = options.find((o) => o.trim()) ?? options[0] ?? "";
    }
    patch({ options, back });
  }

  return (
    <Stack spacing={2}>
      {imageKey ? (
        <Box
          component="img"
          src={mediaUrl(imageKey)}
          alt="Draft media"
          sx={{
            display: "block",
            width: "100%",
            maxHeight: "40vh",
            objectFit: "contain",
            borderRadius: 1,
          }}
        />
      ) : null}
      <FormControl fullWidth size="small" disabled={disabled}>
        <InputLabel id={`card-type-${card.id}`}>Type</InputLabel>
        <Select
          labelId={`card-type-${card.id}`}
          label="Type"
          value={card.type}
          onChange={(e) =>
            onTypeChange(card, e.target.value as CardType, onChange)
          }
        >
          <MenuItem value="qa">Q&A</MenuItem>
          <MenuItem value="cloze">Fill in the blank</MenuItem>
          <MenuItem value="mcq">Multiple choice</MenuItem>
          <MenuItem value="image_label">Image label</MenuItem>
          <MenuItem value="diagram">Diagram</MenuItem>
        </Select>
      </FormControl>

      {isCloze ? (
        <>
          <Box
            sx={{
              p: 2,
              borderRadius: 1,
              bgcolor: "action.hover",
              border: 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              How it will look when you study
            </Typography>
            <Typography
              component="p"
              variant="body1"
              sx={{ whiteSpace: "pre-wrap", mb: clozeAnswer ? 1.5 : 0 }}
            >
              {blankClozeFront(card.front)}
            </Typography>
            {clozeAnswer ? (
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                <Typography variant="caption" color="text.secondary">
                  Answer:
                </Typography>
                <Chip size="small" label={clozeAnswer} color="primary" variant="outlined" />
              </Stack>
            ) : null}
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
              Blanks show as […] when you study
            </Typography>
          </Box>

          <Accordion
            disableGutters
            elevation={0}
            sx={{
              "&:before": { display: "none" },
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls="edit-text-content">
              <Typography variant="body2" fontWeight={500}>
                Edit text
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Stack spacing={2}>
                <TextField
                  label="Front (sentence with blank markup)"
                  value={card.front}
                  onChange={(e) => patch({ front: e.target.value })}
                  multiline
                  minRows={2}
                  fullWidth
                  disabled={disabled}
                  helperText="Advanced: keep the generated blank markers if you edit wording."
                />
                <TextField
                  label="Back"
                  value={card.back}
                  onChange={(e) => patch({ back: e.target.value })}
                  multiline
                  minRows={2}
                  fullWidth
                  disabled={disabled}
                />
              </Stack>
            </AccordionDetails>
          </Accordion>
        </>
      ) : isMcq ? (
        <>
          <TextField
            label="Question"
            value={card.front}
            onChange={(e) => patch({ front: e.target.value })}
            multiline
            minRows={2}
            fullWidth
            disabled={disabled}
          />
          <Typography variant="body2" fontWeight={500}>
            Choices
          </Typography>
          <Stack spacing={1.5}>
            {mcqOptions.map((option, index) => (
              <Stack
                key={index}
                direction="row"
                spacing={1}
                alignItems="flex-start"
              >
                <FormControlLabel
                  sx={{ m: 0, flexShrink: 0, pt: 1 }}
                  control={
                    <Radio
                      checked={card.back === option}
                      onChange={() => setMcqCorrect(index)}
                      disabled={disabled}
                      inputProps={{ "aria-label": `Correct choice ${index + 1}` }}
                    />
                  }
                  label="Correct"
                />
                <TextField
                  label={`Choice ${index + 1}`}
                  value={option}
                  onChange={(e) => updateMcqOption(index, e.target.value)}
                  fullWidth
                  size="small"
                  disabled={disabled}
                />
                <Button
                  variant="text"
                  color="inherit"
                  size="small"
                  disabled={disabled || mcqOptions.length <= MCQ_MIN}
                  onClick={() => removeMcqOption(index)}
                  sx={{ flexShrink: 0, mt: 0.5 }}
                >
                  Remove
                </Button>
              </Stack>
            ))}
          </Stack>
          <Button
            variant="outlined"
            size="small"
            disabled={disabled || mcqOptions.length >= MCQ_MAX}
            onClick={addMcqOption}
            sx={{ alignSelf: "flex-start" }}
          >
            Add choice
          </Button>
          <Typography variant="caption" color="text.secondary">
            Pick the radio next to the right answer ({MCQ_MIN}–{MCQ_MAX} choices).
          </Typography>
        </>
      ) : (
        <>
          <TextField
            label="Front"
            value={card.front}
            onChange={(e) => patch({ front: e.target.value })}
            multiline
            minRows={2}
            fullWidth
            disabled={disabled}
          />
          <TextField
            label="Back"
            value={card.back}
            onChange={(e) => patch({ back: e.target.value })}
            multiline
            minRows={2}
            fullWidth
            disabled={disabled}
          />
        </>
      )}
    </Stack>
  );
}
