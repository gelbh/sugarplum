import { useCallback, useEffect, useState } from "react";
import { useUnlockToasts } from "../achievements/UnlockToastProvider";
import {
  ApiError,
  acceptCard,
  listJobDrafts,
  patchCard,
  rejectCard,
  type CardDraftView,
  type JobListItem,
} from "../api/client";
import { cardPatchBody } from "../cards/cardPatchBody";
import type { DraftEditorChange } from "../components/DraftCardEditor";

type Args = {
  guest: boolean;
  draftJobs: JobListItem[];
  onDraftsChanged?: () => void | Promise<void>;
};

export function useDraftsWorkshop({
  guest,
  draftJobs,
  onDraftsChanged,
}: Args) {
  const { enqueueUnlocks } = useUnlockToasts();
  const [drafts, setDrafts] = useState<CardDraftView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (guest) {
      setDrafts([]);
      setSelectedId(null);
      setDirty(false);
      setError(null);
      return;
    }
    if (draftJobs.length === 0) {
      setDrafts([]);
      setSelectedId(null);
      setDirty(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const lists = await Promise.all(
        draftJobs.map((job) => listJobDrafts(job.id)),
      );
      const next = lists.flat();
      setDrafts(next);
      setSelectedId((prev) => {
        if (prev && next.some((c) => c.id === prev)) return prev;
        return next[0]?.id ?? null;
      });
      setDirty(false);
    } catch (err) {
      setDrafts([]);
      setSelectedId(null);
      setError(
        err instanceof ApiError ? err.message : "Could not load drafts",
      );
    } finally {
      setLoading(false);
    }
  }, [draftJobs, guest]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected =
    drafts.find((card) => card.id === selectedId) ?? drafts[0] ?? null;
  const selectedIndex = selected
    ? drafts.findIndex((card) => card.id === selected.id)
    : -1;
  const remaining = drafts.length;
  const progressLabel =
    remaining === 0
      ? null
      : `${selectedIndex + 1} of ${remaining} remaining`;

  function onSelect(id: string) {
    if (busy) return;
    setSelectedId(id);
    setDirty(false);
    setError(null);
  }

  function onChange(next: DraftEditorChange) {
    if (!selected) return;
    setDrafts((prev) =>
      prev.map((card) =>
        card.id === selected.id
          ? {
              ...card,
              front: next.front,
              back: next.back,
              type: next.type,
              ...(next.options !== undefined ? { options: next.options } : {}),
            }
          : card,
      ),
    );
    setDirty(true);
  }

  async function afterDecision(noticeText: string) {
    setNotice(noticeText);
    setDirty(false);
    await load();
    await onDraftsChanged?.();
  }

  async function onAccept() {
    if (!selected || guest) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (dirty) {
        await patchCard(selected.id, cardPatchBody(selected));
      }
      const accepted = await acceptCard(selected.id);
      if (accepted.unlocks?.length) {
        enqueueUnlocks(accepted.unlocks);
      }
      await afterDecision("Card accepted into study");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept");
    } finally {
      setBusy(false);
    }
  }

  async function onSkip() {
    if (!selected || guest) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await rejectCard(selected.id);
      await afterDecision("Card skipped");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not skip");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!selected || guest || !dirty) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await patchCard(selected.id, cardPatchBody(selected));
      setDrafts((prev) =>
        prev.map((card) => (card.id === updated.id ? updated : card)),
      );
      setDirty(false);
      setNotice("Draft saved");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const primaryJobId = selected?.job_id ?? draftJobs[0]?.id ?? null;

  return {
    drafts,
    selected,
    selectedId: selected?.id ?? null,
    dirty,
    loading,
    busy,
    error,
    notice,
    setNotice,
    remaining,
    progressLabel,
    primaryJobId,
    onSelect,
    onChange,
    onAccept,
    onSkip,
    onSave,
    reload: load,
  };
}
