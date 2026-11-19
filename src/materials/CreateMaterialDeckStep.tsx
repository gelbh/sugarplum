import type { FormEvent, RefObject } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Deck, Subject } from "../api/client";
import { CREATE_NEW_SUBJECT } from "./createMaterialConstants";

type Props = {
  decks: Deck[];
  subjects: Subject[];
  selectedDeckId: string;
  setSelectedDeckId: (id: string) => void;
  selectedSubjectId: string;
  setSelectedSubjectId: (id: string) => void;
  newSubjectTitle: string;
  setNewSubjectTitle: (title: string) => void;
  title: string;
  setTitle: (title: string) => void;
  titleRef: RefObject<HTMLInputElement | null>;
  showNewDeckForm: boolean;
  setShowNewDeckForm: (open: boolean) => void;
  setFocusCreateTitle: (focus: boolean) => void;
  creatingNewSubject: boolean;
  canCreateDeck: boolean;
  subjectDeckChips: string[];
  busy: boolean;
  setActiveStep: (n: number) => void;
  onCreateDeck: (e?: FormEvent) => void | Promise<void>;
};

export function CreateMaterialDeckStep({
  decks,
  subjects,
  selectedDeckId,
  setSelectedDeckId,
  selectedSubjectId,
  setSelectedSubjectId,
  newSubjectTitle,
  setNewSubjectTitle,
  title,
  setTitle,
  titleRef,
  showNewDeckForm,
  setShowNewDeckForm,
  setFocusCreateTitle,
  creatingNewSubject,
  canCreateDeck,
  subjectDeckChips,
  busy,
  setActiveStep,
  onCreateDeck,
}: Props) {
  return (
    <Stack spacing={3}>
      {decks.length > 0 ? (
        <Stack spacing={2}>
          <Typography variant="h6">Choose a deck</Typography>
          <FormControl fullWidth>
            <InputLabel id="existing-deck-label">Existing deck</InputLabel>
            <Select
              labelId="existing-deck-label"
              label="Existing deck"
              value={selectedDeckId}
              onChange={(ev) => setSelectedDeckId(ev.target.value)}
            >
              {decks.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            disabled={!selectedDeckId}
            onClick={() => setActiveStep(1)}
          >
            Continue with this deck
          </Button>
          {!showNewDeckForm ? (
            <Button
              variant="text"
              onClick={() => {
                setShowNewDeckForm(true);
                setFocusCreateTitle(true);
              }}
            >
              Create new deck…
            </Button>
          ) : null}
        </Stack>
      ) : null}
      {decks.length === 0 || showNewDeckForm ? (
        <Box component="form" onSubmit={onCreateDeck} noValidate>
          <Stack spacing={2}>
            <Typography variant="h6">
              {decks.length > 0 ? "New deck" : "Create a deck"}
            </Typography>
            <FormControl fullWidth>
              <InputLabel id="new-deck-subject-label">Subject</InputLabel>
              <Select
                labelId="new-deck-subject-label"
                label="Subject"
                value={selectedSubjectId}
                onChange={(ev) => setSelectedSubjectId(ev.target.value)}
              >
                {subjects.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.title}
                  </MenuItem>
                ))}
                {subjects.length > 0 ? <Divider component="li" /> : null}
                <MenuItem value={CREATE_NEW_SUBJECT}>
                  Create new subject…
                </MenuItem>
              </Select>
            </FormControl>
            {creatingNewSubject ? (
              <TextField
                label="New subject title"
                name="subjectTitle"
                value={newSubjectTitle}
                onChange={(ev) => setNewSubjectTitle(ev.target.value)}
                required
                fullWidth
              />
            ) : null}
            {subjectDeckChips.length > 0 ? (
              <Stack direction="row" spacing={1} useFlexGap sx={{
                flexWrap: "wrap"
              }}>
                {subjectDeckChips.map((chip) => (
                  <Button
                    key={chip}
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setTitle(chip);
                      setShowNewDeckForm(true);
                      setFocusCreateTitle(true);
                    }}
                  >
                    {chip}
                  </Button>
                ))}
              </Stack>
            ) : null}
            <TextField
              label="Deck title"
              name="title"
              value={title}
              onChange={(ev) => setTitle(ev.target.value)}
              required
              fullWidth
              inputRef={titleRef}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={busy || !canCreateDeck}
            >
              {busy ? "Working…" : "Create deck"}
            </Button>
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}
