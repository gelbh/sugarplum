import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { mediaUrl, type CardDraftView, type CardType } from "../api/client";
import {
  CLOZE_BLANK_MAX,
  CLOZE_EXTRA_LABEL,
  composeClozeFront,
  extractClozeAnswers,
  parseClozeDiyFields,
  revealClozeFront,
} from "../lib/clozeFormat";
import { CARD_TYPE_ICONS } from "../lib/cardTypeIcons";
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
  mcqBack,
  type McqDraft,
  withMcqCorrect,
  withMcqOptionAdded,
  withMcqOptionRemoved,
  withMcqOptionText,
} from "../lib/mcqDraftEdit";
import ClozePrompt from "./ClozePrompt";
import OcclusionRegionEditor from "./OcclusionRegionEditor";
import { SelectEnumItem, renderSelectEnumValue } from "./SelectEnumItem";

export { resolveEditorType, type DraftEditorChange };

export type DraftPreviewFace = "front" | "back";

export type DraftCardEditorProps = {
  card: CardDraftView;
  disabled?: boolean;
  onChange: (next: DraftEditorChange) => void;
  /** When set, type Select is limited to these values (hub DIY: qa|cloze|mcq). */
  allowedTypes?: CardType[];
  /** Hub DIY: pick type from cards instead of a dropdown. */
  typePicker?: "select" | "cards";
  /** Notify which side the author is editing (live preview flip). */
  onPreviewFaceChange?: (face: DraftPreviewFace) => void;
  /** Hub DIY: sits under the type picker (e.g. Replace image). */
  afterTypePicker?: ReactNode;
  /** Optional single-card regen control rendered next to the type Select. */
  regenAction?: {
    busy: boolean;
    disabled?: boolean;
    onClick: () => void;
  };
};

function seedClozeDiy(front: string): { sentence: string; blanks: string[] } {
  const parsed = parseClozeDiyFields(front);
  if (parsed) return parsed;
  const revealed = revealClozeFront(front);
  const answers = extractClozeAnswers(front);
  return {
    sentence: revealed,
    blanks: answers.length > 0 ? answers : [""],
  };
}

function ClozeDiyFields({
  cardId,
  frontText,
  backText,
  disabled,
  onPatch,
  onPreviewFaceChange,
  hideInlinePreview = false,
}: {
  cardId: string;
  frontText: string;
  backText: string;
  disabled: boolean;
  onPatch: (partial: Partial<DraftEditorChange>) => void;
  onPreviewFaceChange?: (face: DraftPreviewFace) => void;
  hideInlinePreview?: boolean;
}) {
  const seeded0 = seedClozeDiy(frontText);
  const [sentence, setSentence] = useState(seeded0.sentence);
  const [blanks, setBlanks] = useState(seeded0.blanks);
  const [diyError, setDiyError] = useState<string | null>(null);
  const lastPatchedFront = useRef<string | null>(frontText);

  useEffect(() => {
    if (frontText === lastPatchedFront.current) return;
    const seeded = seedClozeDiy(frontText);
    setSentence(seeded.sentence);
    setBlanks(seeded.blanks);
    setDiyError(null);
    lastPatchedFront.current = frontText;
  }, [cardId, frontText]);

  const clozeAnswers = extractClozeAnswers(frontText);

  function applyDiy(nextSentence: string, nextBlanks: string[]) {
    setSentence(nextSentence);
    setBlanks(nextBlanks.length > 0 ? nextBlanks : [""]);
    const filled = nextBlanks.map((b) => b.trim()).filter(Boolean);
    if (!nextSentence.trim() && filled.length === 0) {
      setDiyError(null);
      lastPatchedFront.current = "";
      onPatch({ front: "" });
      return;
    }
    const composed = composeClozeFront(nextSentence, nextBlanks);
    if (!composed.ok) {
      setDiyError(composed.error);
      lastPatchedFront.current = nextSentence;
      onPatch({ front: nextSentence });
      return;
    }
    setDiyError(null);
    lastPatchedFront.current = composed.front;
    onPatch({ front: composed.front });
  }

  function updateBlank(index: number, value: string) {
    const next = blanks.map((b, i) => (i === index ? value : b));
    applyDiy(sentence, next);
  }

  function addBlank() {
    if (blanks.length >= CLOZE_BLANK_MAX) return;
    applyDiy(sentence, [...blanks, ""]);
  }

  function removeBlank(index: number) {
    if (blanks.length <= 1) return;
    applyDiy(
      sentence,
      blanks.filter((_, i) => i !== index),
    );
  }

  return (
    <>
      {!hideInlinePreview ? (
        <Box
          sx={{
            p: 2,
            borderRadius: 1,
            bgcolor: "action.hover",
            border: 1,
            borderColor: "divider",
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 1 }}
          >
            How it will look when you study
          </Typography>
          <Typography
            component="p"
            variant="body1"
            sx={{ whiteSpace: "pre-wrap", mb: clozeAnswers.length ? 1.5 : 0 }}
          >
            <ClozePrompt front={frontText} />
          </Typography>
          {clozeAnswers.length > 0 ? (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              flexWrap="wrap"
            >
              <Typography variant="caption" color="text.secondary">
                Answer:
              </Typography>
              {clozeAnswers.map((answer) => (
                <Chip
                  key={answer}
                  size="small"
                  label={answer}
                  color="primary"
                  variant="outlined"
                />
              ))}
            </Stack>
          ) : null}
        </Box>
      ) : null}

      <TextField
        label="Sentence"
        value={sentence}
        onChange={(e) => applyDiy(e.target.value, blanks)}
        onFocus={() => onPreviewFaceChange?.("front")}
        multiline
        minRows={3}
        fullWidth
        disabled={disabled}
        placeholder="The full sentence, including words you will hide"
      />
      <Stack spacing={1.25}>
        {blanks.map((blank, index) => (
          <Stack
            key={`cloze-blank-${index}`}
            direction="row"
            spacing={1}
            alignItems="flex-start"
          >
            <TextField
              label={blanks.length === 1 ? "Blank" : `Blank ${index + 1}`}
              value={blank}
              onChange={(e) => updateBlank(index, e.target.value)}
              onFocus={() => onPreviewFaceChange?.("front")}
              fullWidth
              disabled={disabled}
              error={diyError != null && index === blanks.length - 1}
              helperText={
                diyError != null && index === blanks.length - 1
                  ? diyError
                  : undefined
              }
              placeholder="Word to hide (must appear in the sentence)"
            />
            {blanks.length > 1 ? (
              <Button
                variant="text"
                color="inherit"
                size="small"
                disabled={disabled}
                onClick={() => removeBlank(index)}
                sx={{ flexShrink: 0, mt: 1 }}
              >
                Remove
              </Button>
            ) : null}
          </Stack>
        ))}
        <Button
          variant="outlined"
          size="small"
          disabled={disabled || blanks.length >= CLOZE_BLANK_MAX}
          onClick={addBlank}
          sx={{ alignSelf: "flex-start" }}
        >
          Add blank
        </Button>
      </Stack>
      <TextField
        label={CLOZE_EXTRA_LABEL}
        value={backText}
        onChange={(e) => onPatch({ back: e.target.value })}
        onFocus={() => onPreviewFaceChange?.("back")}
        multiline
        minRows={2}
        fullWidth
        disabled={disabled}
        placeholder="Optional note on the answer face"
      />
    </>
  );
}

function TypePickerCards({
  card,
  typeValue,
  typeOptions,
  locked,
  disabled,
  onChange,
}: {
  card: CardDraftView;
  typeValue: CardType;
  typeOptions: CardType[];
  locked: boolean;
  disabled: boolean;
  onChange: (next: DraftEditorChange) => void;
}) {
  return (
    <Box
      role="radiogroup"
      aria-label="Card type"
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 0.75,
      }}
    >
      {typeOptions.map((t) => {
        const selected = typeValue === t;
        const Icon = CARD_TYPE_ICONS[t];
        return (
          <Box
            key={t}
            component="button"
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled || locked}
            onClick={() => {
              if (selected || disabled || locked) return;
              onChange(draftForType(card, t));
            }}
            sx={{
              display: "inline-flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 0.75,
              m: 0,
              px: 1.25,
              py: 0.85,
              textAlign: "left",
              cursor: disabled || locked ? "default" : "pointer",
              borderRadius: 999,
              border: "1px solid",
              borderColor: selected ? "primary.main" : "divider",
              bgcolor: selected ? "action.selected" : "transparent",
              color: "text.primary",
              font: "inherit",
              opacity: disabled || locked ? 0.7 : 1,
              "&:hover":
                disabled || locked
                  ? undefined
                  : {
                      borderColor: selected ? "primary.main" : "text.secondary",
                    },
            }}
          >
            <Icon
              sx={{
                fontSize: 18,
                color: selected ? "primary.light" : "text.secondary",
              }}
            />
            <Typography
              variant="body2"
              sx={{ fontWeight: selected ? 600 : 500 }}
            >
              {TYPE_LABELS[t] ?? t}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

/** Edit front / back / type for a draft card before accept. */
export default function DraftCardEditor({
  card,
  disabled = false,
  onChange,
  allowedTypes,
  typePicker = "select",
  onPreviewFaceChange,
  afterTypePicker,
  regenAction,
}: DraftCardEditorProps) {
  const {
    value: typeValue,
    options: typeOptions,
    locked: typeSelectLocked,
  } = typeSelectModel(
    resolveEditorType(card.type as CardType, allowedTypes).typeValue,
    allowedTypes,
  );

  const isMcq = typeValue === "mcq";
  const mcqOptionsFromCard = isMcq ? mcqDraftFromCard(card).options : [];
  const [mcqCorrectIndex, setMcqCorrectIndex] = useState(
    () => mcqDraftFromCard(card).correctIndex,
  );

  useEffect(() => {
    if (!isMcq) return;
    setMcqCorrectIndex(mcqDraftFromCard(card).correctIndex);
  }, [card.id, isMcq]);

  useEffect(() => {
    if (!isMcq) return;
    setMcqCorrectIndex((i) =>
      Math.min(Math.max(0, i), Math.max(0, mcqOptionsFromCard.length - 1)),
    );
  }, [isMcq, mcqOptionsFromCard.length]);

  if (card.type === "occlusion" && isOcclusionFront(card.front)) {
    const hasImage = Boolean(card.front.image_key.trim());
    return (
      <Stack spacing={2}>
        {typePicker === "cards" ? (
          <TypePickerCards
            card={card}
            typeValue={typeValue}
            typeOptions={typeOptions}
            locked={typeSelectLocked}
            disabled={disabled}
            onChange={onChange}
          />
        ) : null}
        {afterTypePicker}
        {hasImage || typePicker !== "cards" ? (
          <OcclusionRegionEditor
            key={card.id}
            front={card.front}
            disabled={disabled}
            onChange={({ front, back }) =>
              onChange({ front, back, type: "occlusion" })
            }
          />
        ) : null}
      </Stack>
    );
  }

  const imageKey = card.media_r2_keys?.[0];
  const frontText = typeof card.front === "string" ? card.front : "";
  const backText = backAnswer(card.back);
  const isCloze = typeValue === "cloze";
  const mcqDraft: McqDraft = {
    options: mcqOptionsFromCard,
    correctIndex: mcqCorrectIndex,
  };
  const mcqOptions = mcqDraft.options;

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

  function patchMcq(next: McqDraft) {
    setMcqCorrectIndex(next.correctIndex);
    patch({ options: next.options, back: mcqBack(next) });
  }

  function updateMcqOption(index: number, value: string) {
    patchMcq(withMcqOptionText(mcqDraft, index, value));
  }

  function setMcqCorrect(index: number) {
    patchMcq(withMcqCorrect(mcqDraft, index));
  }

  function addMcqOption() {
    patchMcq(withMcqOptionAdded(mcqDraft));
  }

  function removeMcqOption(index: number) {
    patchMcq(withMcqOptionRemoved(mcqDraft, index));
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
      {typePicker === "cards" ? (
        <TypePickerCards
          card={card}
          typeValue={typeValue}
          typeOptions={typeOptions}
          locked={typeSelectLocked}
          disabled={disabled}
          onChange={onChange}
        />
      ) : (
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
              renderValue={(value) =>
                renderSelectEnumValue({
                  icon: CARD_TYPE_ICONS[value as CardType],
                  label: TYPE_LABELS[value as CardType] ?? String(value),
                })
              }
            >
              {typeSelectLocked ? (
                <MenuItem value={typeValue}>
                  <SelectEnumItem
                    icon={CARD_TYPE_ICONS[typeValue]}
                    label={TYPE_LABELS[typeValue] ?? typeValue}
                  />
                </MenuItem>
              ) : (
                typeOptions.map((t) => (
                  <MenuItem key={t} value={t}>
                    <SelectEnumItem
                      icon={CARD_TYPE_ICONS[t]}
                      label={TYPE_LABELS[t] ?? t}
                    />
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
          {regenAction ? (
            <Button
              variant="outlined"
              startIcon={<AutorenewRoundedIcon sx={{ fontSize: 18 }} />}
              onClick={regenAction.onClick}
              disabled={
                disabled || regenAction.busy || regenAction.disabled === true
              }
              sx={{
                flexShrink: 0,
                alignSelf: { xs: "stretch", sm: "center" },
                minHeight: 40,
                px: 1.6,
                borderRadius: 999,
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.8125rem",
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
                borderColor: "rgba(232, 216, 199, 0.28)",
                color: "rgba(232, 216, 199, 0.88)",
                bgcolor: "rgba(18, 7, 15, 0.22)",
                "&:hover": {
                  borderColor: "rgba(232, 216, 199, 0.48)",
                  bgcolor: "rgba(91, 44, 111, 0.22)",
                },
              }}
            >
              {regenAction.busy ? "Regenerating…" : "Regenerate"}
            </Button>
          ) : null}
        </Stack>
      )}
      {afterTypePicker}

      {isCloze ? (
        <ClozeDiyFields
          cardId={card.id}
          frontText={frontText}
          backText={backText}
          disabled={disabled}
          onPatch={patch}
          onPreviewFaceChange={onPreviewFaceChange}
          hideInlinePreview={typePicker === "cards"}
        />
      ) : isMcq ? (
        <>
          <TextField
            label="Question"
            value={frontText}
            onChange={(e) => patch({ front: e.target.value })}
            onFocus={() => onPreviewFaceChange?.("front")}
            multiline
            minRows={2}
            fullWidth
            disabled={disabled}
          />
          <Stack spacing={1}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              Choices
            </Typography>
            <RadioGroup
              value={String(mcqDraft.correctIndex)}
              onChange={(_, value) => setMcqCorrect(Number(value))}
            >
              <Stack spacing={1}>
                {mcqOptions.map((option, index) => (
                  <Stack
                    key={index}
                    direction="row"
                    spacing={0.75}
                    alignItems="center"
                    sx={{
                      px: 1,
                      py: 0.75,
                      borderRadius: 1.5,
                      border: "1px solid",
                      borderColor:
                        mcqDraft.correctIndex === index
                          ? "rgba(167, 139, 250, 0.45)"
                          : "rgba(232, 216, 199, 0.12)",
                      bgcolor:
                        mcqDraft.correctIndex === index
                          ? "rgba(91, 44, 111, 0.18)"
                          : "rgba(18, 7, 15, 0.22)",
                    }}
                  >
                    <FormControlLabel
                      value={String(index)}
                      sx={{
                        m: 0,
                        mr: 0.5,
                        flexShrink: 0,
                        "& .MuiFormControlLabel-label": {
                          fontSize: "0.75rem",
                          color: "text.secondary",
                        },
                      }}
                      control={
                        <Radio
                          size="small"
                          disabled={disabled}
                          inputProps={{
                            "aria-label": `Correct choice ${index + 1}`,
                          }}
                        />
                      }
                      label={mcqDraft.correctIndex === index ? "Correct" : ""}
                    />
                    <TextField
                      placeholder={`Choice ${index + 1}`}
                      value={option}
                      onChange={(e) => updateMcqOption(index, e.target.value)}
                      onFocus={() => onPreviewFaceChange?.("front")}
                      fullWidth
                      size="small"
                      disabled={disabled}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          bgcolor: "transparent",
                        },
                      }}
                    />
                    <IconButton
                      size="small"
                      aria-label={`Remove choice ${index + 1}`}
                      disabled={disabled || mcqOptions.length <= MCQ_MIN}
                      onClick={() => removeMcqOption(index)}
                      sx={{ color: "text.secondary", flexShrink: 0 }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            </RadioGroup>
            <Button
              variant="text"
              size="small"
              disabled={disabled || mcqOptions.length >= MCQ_MAX}
              onClick={addMcqOption}
              sx={{
                alignSelf: "flex-start",
                color: "text.secondary",
                textTransform: "none",
              }}
            >
              Add choice
            </Button>
            <Typography variant="caption" color="text.secondary">
              Mark one correct answer ({MCQ_MIN}–{MCQ_MAX} choices).
            </Typography>
          </Stack>
        </>
      ) : (
        <>
          <TextField
            label="Front"
            value={frontText}
            onChange={(e) => patch({ front: e.target.value })}
            onFocus={() => onPreviewFaceChange?.("front")}
            multiline
            minRows={4}
            fullWidth
            disabled={disabled}
          />
          <TextField
            label="Back"
            value={backText}
            onChange={(e) => patch({ back: e.target.value })}
            onFocus={() => onPreviewFaceChange?.("back")}
            multiline
            minRows={4}
            fullWidth
            disabled={disabled}
          />
        </>
      )}
    </Stack>
  );
}
