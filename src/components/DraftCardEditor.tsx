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
import { mediaUrl, type CardDraftView, type CardType } from "../api/client";
import {
  CLOZE_EXTRA_LABEL,
  extractClozeAnswer,
} from "../lib/clozeFormat";
import {
  backAnswer,
  draftForType,
  isOcclusionFront,
  mcqDraftFromCard,
  resolveEditorType,
  typeSelectModel,
  TYPE_LABELS,
  type DraftEditorChange,
} from "../lib/draftCardModel";
import {
  MCQ_MAX,
  MCQ_MIN,
  type McqDraft,
  withMcqCorrect,
  withMcqOptionAdded,
  withMcqOptionRemoved,
  withMcqOptionText,
} from "../lib/mcqDraftEdit";
import ClozePrompt from "./ClozePrompt";
import OcclusionRegionEditor from "./OcclusionRegionEditor";

export { resolveEditorType, type DraftEditorChange };

export type DraftCardEditorProps = {
  card: CardDraftView;
  disabled?: boolean;
  onChange: (next: DraftEditorChange) => void;
  /** When set, type Select is limited to these values (hub DIY: qa|cloze|mcq). */
  allowedTypes?: CardType[];
  /** Optional single-card regen control rendered next to the type Select. */
  regenAction?: {
    busy: boolean;
    disabled?: boolean;
    onClick: () => void;
  };
};

/** Edit front / back / type for a draft card before accept. */
export default function DraftCardEditor({
  card,
  disabled = false,
  onChange,
  allowedTypes,
  regenAction,
}: DraftCardEditorProps) {
  if (card.type === "occlusion" && isOcclusionFront(card.front)) {
    return (
      <OcclusionRegionEditor
        key={card.id}
        front={card.front}
        disabled={disabled}
        onChange={({ front, back }) =>
          onChange({ front, back, type: "occlusion" })
        }
      />
    );
  }

  const imageKey = card.media_r2_keys?.[0];
  const frontText = typeof card.front === "string" ? card.front : "";
  const backText = backAnswer(card.back);
  const {
    value: typeValue,
    options: typeOptions,
    locked: typeSelectLocked,
  } = typeSelectModel(
    // An occlusion-typed card without a region front still edits as qa here.
    resolveEditorType(card.type as CardType, allowedTypes).typeValue,
    allowedTypes,
  );
  const isCloze = typeValue === "cloze";
  const isMcq = typeValue === "mcq";
  const mcqDraft: McqDraft = isMcq
    ? mcqDraftFromCard(card)
    : { options: [], back: backText };
  const mcqOptions = mcqDraft.options;
  const clozeAnswer = isCloze
    ? (extractClozeAnswer(frontText) ?? (backText.trim() || null))
    : null;

  function patch(partial: Partial<DraftEditorChange>) {
    onChange({
      front: partial.front ?? frontText,
      back: partial.back ?? backText,
      type: partial.type ?? typeValue,
      ...(partial.options !== undefined
        ? { options: partial.options }
        : isMcq
          ? { options: mcqOptions }
          : {}),
    });
  }

  function updateMcqOption(index: number, value: string) {
    patch(withMcqOptionText(mcqDraft, index, value));
  }

  function setMcqCorrect(index: number) {
    patch(withMcqCorrect(mcqDraft, index));
  }

  function addMcqOption() {
    patch(withMcqOptionAdded(mcqDraft));
  }

  function removeMcqOption(index: number) {
    patch(withMcqOptionRemoved(mcqDraft, index));
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
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        alignItems={{ sm: "flex-start" }}
      >
        <FormControl
          fullWidth
          size="small"
          disabled={disabled || typeSelectLocked}
        >
          <InputLabel id={`card-type-${card.id}`}>Type</InputLabel>
          <Select
            labelId={`card-type-${card.id}`}
            label="Type"
            value={typeValue}
            onChange={(e) =>
              onChange(draftForType(card, e.target.value as CardType))
            }
          >
            {typeSelectLocked ? (
              <MenuItem value={typeValue}>
                {TYPE_LABELS[typeValue] ?? typeValue}
              </MenuItem>
            ) : (
              typeOptions.map((t) => (
                <MenuItem key={t} value={t}>
                  {TYPE_LABELS[t] ?? t}
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>
        {regenAction ? (
          <Button
            variant="outlined"
            onClick={regenAction.onClick}
            disabled={
              disabled || regenAction.busy || regenAction.disabled === true
            }
            sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
          >
            {regenAction.busy ? "Regenerating…" : "Regenerate this card"}
          </Button>
        ) : null}
      </Stack>

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
              <ClozePrompt front={frontText} />
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
              Blanks show as a line when you study
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
                  value={frontText}
                  onChange={(e) => patch({ front: e.target.value })}
                  multiline
                  minRows={2}
                  fullWidth
                  disabled={disabled}
                  helperText="Advanced: keep the generated blank markers if you edit wording."
                />
                <TextField
                  label={CLOZE_EXTRA_LABEL}
                  value={backText}
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
            value={frontText}
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
                      checked={backText === option}
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
            value={frontText}
            onChange={(e) => patch({ front: e.target.value })}
            multiline
            minRows={2}
            fullWidth
            disabled={disabled}
          />
          <TextField
            label="Back"
            value={backText}
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
