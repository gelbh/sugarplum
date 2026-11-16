import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import {
  ApiError,
  pasteMaterial,
  topicHintsFromLines,
  type Deck,
} from "../api/client";
import { guestPasteToCards } from "../guest/pasteToCards";
import { guestAddAcceptedCards } from "../guest/store";
import type { SourceRole } from "../lib/sourceRole";

type Args = {
  decks: Deck[];
  selectedDeckId: string;
  alsoCover: string;
  setAlsoCover: Dispatch<SetStateAction<string>>;
  sourceRole: SourceRole;
  setSourceRole: Dispatch<SetStateAction<SourceRole>>;
  setActiveStep: (n: number) => void;
  onChanged?: () => void | Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setJobId: Dispatch<SetStateAction<string | null>>;
};

export function useCreateMaterialPaste({
  decks,
  selectedDeckId,
  alsoCover,
  setAlsoCover,
  sourceRole,
  setSourceRole,
  setActiveStep,
  onChanged,
  setError,
  setNotice,
  setBusy,
  setJobId,
}: Args) {
  const [pasteText, setPasteText] = useState("");
  const [filename, setFilename] = useState("");

  async function onGuestPaste(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    setJobId(null);
    if (!selectedDeckId) {
      setError("Select a deck first");
      return;
    }
    const { cards: pairs, truncated } = guestPasteToCards(pasteText);
    if (pairs.length === 0) {
      setError(
        "Paste needs clearer paragraphs or Q&A lines (blank line between cards).",
      );
      return;
    }
    setBusy(true);
    try {
      const added = guestAddAcceptedCards(selectedDeckId, pairs);
      if (added.length === 0) {
        setError("Deck missing or could not save. Pick a deck and try again.");
        return;
      }
      const deckTitle =
        decks.find((d) => d.id === selectedDeckId)?.title ?? "deck";
      setPasteText("");
      const truncNote = truncated
        ? ` (kept first ${added.length}; paste was longer than the 40-card limit)`
        : "";
      setNotice(
        `Added ${added.length} local cards to “${deckTitle}”${truncNote}`,
      );
      try {
        await onChanged?.();
      } catch {
        /* refresh must not look like a save failure */
      }
      // After journey sync (which only maps to steps 0/1), lock Done.
      setActiveStep(2);
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" || err.code === 22)
      ) {
        setError(
          "Browser storage is full. Shorten the paste or clear guest data, then try again.",
        );
      } else {
        setError("Could not save local cards");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onPaste(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    setJobId(null);
    if (!selectedDeckId) {
      setError("Select a deck first");
      return;
    }
    setBusy(true);
    try {
      const topicHints = topicHintsFromLines(alsoCover);
      const material = await pasteMaterial(selectedDeckId, {
        text: pasteText,
        ...(filename.trim() ? { filename: filename.trim() } : {}),
        source_role: sourceRole,
        ...(topicHints ? { topicHints } : {}),
      });
      setPasteText("");
      setFilename("");
      setSourceRole("lecture");
      setAlsoCover("");
      if (material.jobId) {
        window.location.assign(
          `/jobs/${encodeURIComponent(material.jobId)}/drafts`,
        );
        return;
      }
      setNotice(`Saved paste material (${material.status})`);
      setActiveStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save paste");
    } finally {
      setBusy(false);
    }
  }

  return {
    pasteText,
    setPasteText,
    filename,
    setFilename,
    onGuestPaste,
    onPaste,
  };
}
