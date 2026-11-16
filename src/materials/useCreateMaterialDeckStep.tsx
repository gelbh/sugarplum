import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import {
  ApiError,
  createDeck,
  createSubject,
  listSubjects,
  type Deck,
  type Subject,
} from "../api/client";
import { CREATE_NEW_DECK, CREATE_NEW_SUBJECT } from "./createMaterialConstants";

type Args = {
  decks: Deck[];
  setDecks: (updater: (prev: Deck[]) => Deck[]) => void;
  subjectsProp?: Subject[];
  setSubjectsProp?: (updater: (prev: Subject[]) => Subject[]) => void;
  deckChipsBySubjectId: Record<string, string[]>;
  activeStep: number;
  setActiveStep: (n: number) => void;
  onChanged?: () => void | Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
};

export function useCreateMaterialDeckStep({
  decks,
  setDecks,
  subjectsProp,
  setSubjectsProp,
  deckChipsBySubjectId,
  activeStep,
  setActiveStep,
  onChanged,
  setError,
  setNotice,
  setBusy,
}: Args) {
  const [localSubjects, setLocalSubjects] = useState<Subject[]>([]);
  const subjects = subjectsProp ?? localSubjects;
  const setSubjects = setSubjectsProp ?? setLocalSubjects;

  const [title, setTitle] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [newSubjectTitle, setNewSubjectTitle] = useState("");
  const [focusCreateTitle, setFocusCreateTitle] = useState(false);
  const [showNewDeckForm, setShowNewDeckForm] = useState(false);

  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (subjectsProp) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listSubjects();
        if (!cancelled) setLocalSubjects(list);
      } catch {
        /* subject list optional until create */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectsProp]);

  useEffect(() => {
    setSelectedDeckId((prev) =>
      prev && decks.some((d) => d.id === prev) ? prev : (decks[0]?.id ?? ""),
    );
  }, [decks]);

  useEffect(() => {
    setSelectedSubjectId((prev) => {
      if (prev === CREATE_NEW_SUBJECT) return prev;
      if (prev && subjects.some((s) => s.id === prev)) return prev;
      return subjects[0]?.id ?? CREATE_NEW_SUBJECT;
    });
  }, [subjects]);

  useEffect(() => {
    if (focusCreateTitle && activeStep === 0) {
      titleRef.current?.focus();
      setFocusCreateTitle(false);
    }
  }, [focusCreateTitle, activeStep]);

  function onDeckSelect(value: string) {
    if (value === CREATE_NEW_DECK) {
      setActiveStep(0);
      setShowNewDeckForm(true);
      setFocusCreateTitle(true);
      return;
    }
    setSelectedDeckId(value);
  }

  function deckSelect(labelId: string): ReactNode {
    return (
      <FormControl fullWidth>
        <InputLabel id={labelId}>Deck</InputLabel>
        <Select
          labelId={labelId}
          label="Deck"
          value={selectedDeckId}
          onChange={(ev) => onDeckSelect(ev.target.value)}
          displayEmpty={decks.length === 0}
          renderValue={(value) => {
            if (!value) return "Choose a deck";
            return decks.find((d) => d.id === value)?.title ?? "Choose a deck";
          }}
        >
          {decks.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {d.title}
            </MenuItem>
          ))}
          {decks.length > 0 ? <Divider component="li" /> : null}
          <MenuItem value={CREATE_NEW_DECK}>Create new deck…</MenuItem>
        </Select>
      </FormControl>
    );
  }

  const creatingNewSubject = selectedSubjectId === CREATE_NEW_SUBJECT;
  const canCreateDeck =
    Boolean(title.trim()) &&
    (creatingNewSubject
      ? Boolean(newSubjectTitle.trim())
      : Boolean(selectedSubjectId));
  const subjectDeckChips =
    !creatingNewSubject && selectedSubjectId
      ? (deckChipsBySubjectId[selectedSubjectId] ?? [])
      : [];

  async function onCreateDeck(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    if (!canCreateDeck) {
      setError(
        creatingNewSubject
          ? "Enter a subject title and deck title"
          : "Choose a subject and enter a deck title",
      );
      return;
    }
    setBusy(true);
    try {
      let subjectId = selectedSubjectId;
      if (creatingNewSubject) {
        const created = await createSubject(newSubjectTitle.trim());
        setSubjects((prev) => [...prev, created]);
        subjectId = created.id;
        setSelectedSubjectId(created.id);
        setNewSubjectTitle("");
      }
      const deck = await createDeck(title.trim(), subjectId);
      setDecks((prev) => [...prev, deck]);
      setSelectedDeckId(deck.id);
      setTitle("");
      setShowNewDeckForm(false);
      setNotice(`Created “${deck.title}”`);
      setActiveStep(1);
      await onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create deck");
    } finally {
      setBusy(false);
    }
  }

  return {
    subjects,
    title,
    setTitle,
    selectedDeckId,
    setSelectedDeckId,
    selectedSubjectId,
    setSelectedSubjectId,
    newSubjectTitle,
    setNewSubjectTitle,
    showNewDeckForm,
    setShowNewDeckForm,
    setFocusCreateTitle,
    titleRef,
    creatingNewSubject,
    canCreateDeck,
    subjectDeckChips,
    onDeckSelect,
    deckSelect,
    onCreateDeck,
  };
}
