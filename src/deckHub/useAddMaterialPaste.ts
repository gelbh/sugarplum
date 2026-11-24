import { useState, type FormEvent } from "react";
import { ApiError, pasteMaterial } from "../api/client";
import { guestPasteToCards } from "../guest/pasteToCards";
import { guestAddAcceptedCards } from "../guest/store";
import { storedUploadNotice } from "../materials/kernel";

type Args = {
  deckId: string;
  setAlsoCover: (value: string) => void;
  setMaterialBusy: (busy: boolean) => void;
  setMaterialError: (error: string | null) => void;
  setMaterialNotice: (notice: string | null) => void;
  topicHintOpts: () => { topicHints?: string[] };
  refreshCards: () => Promise<void>;
  refreshDraftJobs: () => Promise<void>;
  refreshMaterials: () => Promise<void>;
};

export function useAddMaterialPaste({
  deckId,
  setAlsoCover,
  setMaterialBusy,
  setMaterialError,
  setMaterialNotice,
  topicHintOpts,
  refreshCards,
  refreshDraftJobs,
  refreshMaterials,
}: Args) {
  const [pasteText, setPasteText] = useState("");
  const [pasteFilename, setPasteFilename] = useState("");

  async function onGuestPaste(e?: FormEvent) {
    e?.preventDefault();
    setMaterialError(null);
    setMaterialNotice(null);
    const { cards: pairs, truncated } = guestPasteToCards(pasteText);
    if (pairs.length === 0) {
      setMaterialError(
        "Paste needs clearer paragraphs or Q&A lines (blank line between cards).",
      );
      return;
    }
    setMaterialBusy(true);
    try {
      const added = guestAddAcceptedCards(deckId, pairs);
      if (added.length === 0) {
        setMaterialError("Could not save. Try again.");
        return;
      }
      setPasteText("");
      await refreshCards();
      const truncNote = truncated
        ? ` (kept first ${added.length}; paste was longer than the 40-card limit)`
        : "";
      setMaterialNotice(`Added ${added.length} local cards${truncNote}`);
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" || err.code === 22)
      ) {
        setMaterialError(
          "Browser storage is full. Shorten the paste or clear guest data, then try again.",
        );
      } else {
        setMaterialError("Could not save local cards");
      }
    } finally {
      setMaterialBusy(false);
    }
  }

  async function onAccountPaste(e?: FormEvent) {
    e?.preventDefault();
    setMaterialError(null);
    setMaterialNotice(null);
    if (!pasteText.trim()) {
      setMaterialError("Paste some text first");
      return;
    }
    setMaterialBusy(true);
    try {
      const material = await pasteMaterial(deckId, {
        text: pasteText,
        ...(pasteFilename.trim() ? { filename: pasteFilename.trim() } : {}),
        ...topicHintOpts(),
      });
      setPasteText("");
      setPasteFilename("");
      setAlsoCover("");
      if (material.jobId) {
        setMaterialNotice(
          storedUploadNotice({
            status: material.status,
            jobId: material.jobId,
            reused: material.reused,
          }),
        );
        window.location.assign(
          `/jobs/${encodeURIComponent(material.jobId)}/drafts`,
        );
        return;
      }
      setMaterialNotice(`Saved paste material (${material.status})`);
      await Promise.all([refreshDraftJobs(), refreshMaterials()]);
    } catch (err) {
      setMaterialError(
        err instanceof ApiError ? err.message : "Could not save paste",
      );
    } finally {
      setMaterialBusy(false);
    }
  }

  return {
    pasteText,
    setPasteText,
    pasteFilename,
    setPasteFilename,
    onGuestPaste,
    onAccountPaste,
  };
}
