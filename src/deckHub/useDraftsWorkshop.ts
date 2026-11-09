import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUnlockToasts } from "../achievements/UnlockToastProvider";
import {
  ApiError,
  acceptCard,
  acceptSafeJobDrafts,
  listJobDrafts,
  patchCard,
  rejectCard,
  type CardDraftView,
  type JobListItem,
} from "../api/client";
import { cardPatchBody } from "../cards/cardPatchBody";
import type { DraftEditorChange } from "../components/DraftCardEditor";
import { isStoredDraftSafe } from "../../worker/generation/storedDraftQuality";

function fieldsFromView(card: CardDraftView) {
  return {
    type: card.type,
    front: card.front,
    back:
      card.type === "mcq"
        ? {
            answer: typeof card.back === "string" ? card.back : "",
            options: card.options ?? [],
          }
        : card.back,
    options: card.options,
    provenance: card.provenance,
    media_keys: card.media_r2_keys,
  };
}

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
  const loadSeq = useRef(0);

  const jobIdsKey = useMemo(
    () => draftJobs.map((job) => job.id).join("|"),
    [draftJobs],
  );

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    if (guest) {
      if (seq !== loadSeq.current) return;
      setDrafts([]);
      setSelectedId(null);
      setDirty(false);
      setError(null);
      setLoading(false);
      return;
    }
    const jobIds = jobIdsKey ? jobIdsKey.split("|") : [];
    if (jobIds.length === 0) {
      if (seq !== loadSeq.current) return;
      setDrafts([]);
      setSelectedId(null);
      setDirty(false);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const settled = await Promise.allSettled(
        jobIds.map((id) => listJobDrafts(id)),
      );
      if (seq !== loadSeq.current) return;
      const next: CardDraftView[] = [];
      const failures: string[] = [];
      for (const result of settled) {
        if (result.status === "fulfilled") {
          next.push(...result.value);
        } else {
          const reason = result.reason;
          failures.push(
            reason instanceof ApiError
              ? reason.message
              : "Could not load some drafts",
          );
        }
      }
      setDrafts(next);
      setSelectedId((prev) => {
        if (prev && next.some((c) => c.id === prev)) return prev;
        return next[0]?.id ?? null;
      });
      setDirty(false);
      setError(
        failures.length === settled.length
          ? failures[0] ?? "Could not load drafts"
          : failures.length > 0
            ? failures[0] ?? null
            : null,
      );
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError ? err.message : "Could not load drafts",
      );
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [guest, jobIdsKey]);

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
    if (dirty && id !== selectedId) {
      setError("Save, Accept, or Skip before switching drafts");
      return;
    }
    setSelectedId(id);
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

  async function afterDecision(decidedId: string, noticeText: string) {
    setNotice(noticeText);
    setDirty(false);
    setDrafts((prev) => {
      const next = prev.filter((card) => card.id !== decidedId);
      setSelectedId((cur) => {
        if (cur && next.some((c) => c.id === cur)) return cur;
        return next[0]?.id ?? null;
      });
      return next;
    });
    await onDraftsChanged?.();
  }

  async function onAccept() {
    if (!selected || guest) return;
    const decidedId = selected.id;
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
      await afterDecision(decidedId, "Card accepted into study");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept");
    } finally {
      setBusy(false);
    }
  }

  async function onSkip() {
    if (!selected || guest) return;
    const decidedId = selected.id;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await rejectCard(selected.id);
      await afterDecision(decidedId, "Card skipped");
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

  const safePreviewCount = drafts.filter((card) =>
    isStoredDraftSafe(fieldsFromView(card)),
  ).length;
  const unsafePreviewCount = Math.max(0, drafts.length - safePreviewCount);

  async function onAcceptAllSafe() {
    if (guest || drafts.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let jobIds = [
        ...new Set(
          drafts
            .map((card) => card.job_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
      ];
      if (jobIds.length === 0 && draftJobs[0]) {
        jobIds = [draftJobs[0].id];
      }
      let accepted = 0;
      let failed = 0;
      let leftUnsafe = 0;
      for (const jobId of jobIds) {
        const result = await acceptSafeJobDrafts(jobId);
        accepted += result.accepted;
        failed += result.failed;
        leftUnsafe += result.leftUnsafe;
        if (result.unlocks?.length) {
          enqueueUnlocks(result.unlocks);
        }
      }
      await load();
      await onDraftsChanged?.();
      const parts = [`Accepted ${accepted} safe`];
      if (leftUnsafe > 0) parts.push(`${leftUnsafe} left for review`);
      if (failed > 0) parts.push(`${failed} failed`);
      setNotice(parts.join(" · "));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not accept safe drafts",
      );
    } finally {
      setBusy(false);
    }
  }

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
    safePreviewCount,
    unsafePreviewCount,
    onSelect,
    onChange,
    onAccept,
    onSkip,
    onSave,
    onAcceptAllSafe,
    reload: load,
  };
}
