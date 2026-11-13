import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { gradeAnswer } from "./gradeAnswer";
import { pickMcqDistractors } from "./mcqDistractors";
import type { AnatomyStructure } from "./types";

export type AnatomyStudyMode = "explore" | "type" | "mcq";

const MCQ_DISTRACTOR_COUNT = 3;

type Props = {
  mode: AnatomyStudyMode;
  onModeChange: (mode: AnatomyStudyMode) => void;
  structure: AnatomyStructure | null;
  regionStructures: AnatomyStructure[];
  revealedIds: ReadonlySet<string>;
  onCorrect: (structureId: string) => void;
};

export default function TestYourself({
  mode,
  onModeChange,
  structure,
  regionStructures,
  revealedIds,
  onCorrect,
}: Props) {
  const [typed, setTyped] = useState("");
  const [typeFeedback, setTypeFeedback] = useState<"idle" | "wrong" | "right">(
    "idle",
  );
  const [mcqChoices, setMcqChoices] = useState<AnatomyStructure[]>([]);
  const [mcqPickedId, setMcqPickedId] = useState<string | null>(null);

  const progressTotal = regionStructures.length;
  const progressDone = regionStructures.filter((s) =>
    revealedIds.has(s.id),
  ).length;

  useEffect(() => {
    setTyped("");
    setTypeFeedback("idle");
    setMcqPickedId(null);
    if (!structure || mode !== "mcq") {
      setMcqChoices([]);
      return;
    }
    if (revealedIds.has(structure.id)) {
      setMcqChoices([]);
      return;
    }
    const distractors = pickMcqDistractors(
      regionStructures,
      structure.id,
      MCQ_DISTRACTOR_COUNT,
    );
    const options = [structure, ...distractors];
    // Shuffle with Math.random for live UI (unit tests cover the picker).
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = options[i]!;
      options[i] = options[j]!;
      options[j] = tmp;
    }
    setMcqChoices(options);
  }, [structure?.id, mode, regionStructures, revealedIds]);

  const revealed = structure ? revealedIds.has(structure.id) : false;

  const submitType = () => {
    if (!structure || revealed) return;
    if (gradeAnswer(typed, structure)) {
      setTypeFeedback("right");
      onCorrect(structure.id);
      return;
    }
    setTypeFeedback("wrong");
  };

  const pickMcq = (id: string) => {
    if (!structure || revealed || mcqPickedId != null) return;
    setMcqPickedId(id);
    if (id === structure.id) onCorrect(structure.id);
  };

  const modeHint = useMemo(() => {
    if (mode === "explore") return null;
    if (!structure) return "Select a structure on the model or in the list.";
    if (revealed) return `Correct: ${structure.label}`;
    if (mode === "type") return "Type the name, then press Enter.";
    return "Choose the correct name.";
  }, [mode, structure, revealed]);

  return (
    <Box
      component="aside"
      aria-label="Test yourself"
      sx={{
        width: "100%",
        flexShrink: 0,
        borderRadius: 1,
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        p: 1.25,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <ToggleButtonGroup
        exclusive
        size="small"
        fullWidth
        value={mode}
        onChange={(_ev, next: AnatomyStudyMode | null) => {
          if (next) onModeChange(next);
        }}
        aria-label="Anatomy study mode"
      >
        <ToggleButton value="explore">Explore</ToggleButton>
        <ToggleButton value="type">Type</ToggleButton>
        <ToggleButton value="mcq">MCQ</ToggleButton>
      </ToggleButtonGroup>

      {mode !== "explore" ? (
        <>
          <Typography variant="caption" color="text.secondary">
            Progress: {progressDone}/{progressTotal}
          </Typography>
          {modeHint ? (
            <Typography variant="body2" color="text.secondary">
              {modeHint}
            </Typography>
          ) : null}

          {mode === "type" && structure && !revealed ? (
            <TextField
              size="small"
              label="Structure name"
              value={typed}
              onChange={(ev) => {
                setTyped(ev.target.value);
                if (typeFeedback !== "idle") setTypeFeedback("idle");
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.preventDefault();
                  submitType();
                }
              }}
              error={typeFeedback === "wrong"}
              helperText={
                typeFeedback === "wrong" ? "Not quite — try again." : " "
              }
              autoComplete="off"
              fullWidth
            />
          ) : null}

          {mode === "mcq" && structure && !revealed && mcqChoices.length > 0 ? (
            <Stack spacing={0.75}>
              {mcqChoices.map((choice) => {
                const picked = mcqPickedId === choice.id;
                const isCorrect = choice.id === structure.id;
                const markedWrong = picked && !isCorrect;
                const markedRight =
                  mcqPickedId != null && isCorrect && (picked || revealed);
                return (
                  <Button
                    key={choice.id}
                    size="small"
                    variant={picked || markedRight ? "contained" : "outlined"}
                    color={
                      markedWrong ? "error" : markedRight ? "success" : "primary"
                    }
                    disabled={mcqPickedId != null}
                    onClick={() => pickMcq(choice.id)}
                    sx={{ justifyContent: "flex-start", textTransform: "none" }}
                  >
                    {choice.label}
                  </Button>
                );
              })}
              {mcqPickedId != null && mcqPickedId !== structure.id ? (
                <Typography variant="caption" color="error">
                  Incorrect. Correct: {structure.label}
                </Typography>
              ) : null}
            </Stack>
          ) : null}
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Explore freely, or switch to Type / MCQ to test yourself.
        </Typography>
      )}
    </Box>
  );
}
