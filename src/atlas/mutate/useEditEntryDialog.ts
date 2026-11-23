import { useEffect, useState, type FormEvent } from "react";
import {
  patchEntry,
  resetEntry,
  resetEntryFields,
  softDeleteEntry,
} from "../hub/apiSource";
import { errMessage } from "./atlasMutateHelpers";
import { entryTitles } from "../lib/entryTitles";
import {
  diffEntryPatch,
  draftFromEntry,
  isEmptyPatch,
  validateEntryPatch,
  withFieldFromEntry,
  type EntryDraft,
  type EntryPatch,
  type EntryPatchErrors,
} from "./entryPatch";
import type { AtlasEntryView, FieldKey } from "../types";

export type EditEntryDialogArgs = {
  open: boolean;
  atlasId: string;
  entry: AtlasEntryView | null;
  onClose: () => void;
  onDone: () => void;
  /**
   * Phase 4 seam. Runs after patchEntry succeeds and onDone fires, with the
   * exact sparse patch that was sent. It owns its own error UI; a rejection
   * is logged and the dialog still closes. The personal edit is never undone.
   */
  afterSave?: (patch: EntryPatch) => Promise<void>;
};

export function useEditEntryDialog({
  open,
  atlasId,
  entry,
  onClose,
  onDone,
  afterSave,
}: EditEntryDialogArgs) {
  // The view the draft is diffed against; a per-field reset replaces it.
  const [base, setBase] = useState<AtlasEntryView | null>(null);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<EntryPatchErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !entry) return;
    setBase(entry);
    setDraft(draftFromEntry(entry));
    setFieldErrors({});
    setError(null);
    setBusy(false);
  }, [open, entry]);

  function update<K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!base || !draft) return;
    const patch = diffEntryPatch(base, draft);
    const errors = validateEntryPatch(base, patch);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (isEmptyPatch(patch)) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchEntry(atlasId, base.id, patch);
    } catch (err) {
      setError(errMessage(err, "Could not save entry"));
      setBusy(false);
      return;
    }
    onDone();
    if (afterSave) {
      try {
        await afterSave(patch);
      } catch (err) {
        console.warn("atlas edit afterSave failed", err);
      }
    }
    setBusy(false);
    onClose();
  }

  async function onResetField(field: FieldKey) {
    if (!base) return;
    setBusy(true);
    setError(null);
    try {
      const view = await resetEntryFields(atlasId, base.id, [field]);
      setBase(view);
      setDraft((d) => (d ? withFieldFromEntry(d, base, view, field) : d));
      setFieldErrors(({ [field]: _cleared, ...rest }) => rest);
      onDone();
    } catch (err) {
      setError(errMessage(err, "Could not reset field"));
    } finally {
      setBusy(false);
    }
  }

  async function onSoftDelete() {
    if (!base) return;
    if (!window.confirm(`Soft-delete ${entryTitles(base).primary}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await softDeleteEntry(atlasId, base.id);
      onDone();
      onClose();
    } catch (err) {
      setError(errMessage(err, "Could not delete entry"));
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    if (!base?.originKey) return;
    if (!window.confirm(`Reset ${entryTitles(base).primary} to the dataset?`))
      return;
    setBusy(true);
    setError(null);
    try {
      await resetEntry(atlasId, base.id);
      onDone();
      onClose();
    } catch (err) {
      setError(errMessage(err, "Could not reset entry"));
    } finally {
      setBusy(false);
    }
  }

  return {
    draft,
    update,
    fieldErrors,
    busy,
    error,
    editedFields: base?.editedFields ?? [],
    canReset: Boolean(base?.originKey && base?.editedAt),
    canEditCanonical: base !== null && base.originKey === null,
    diagnosticOwned:
      base?.fields.lifecycleStages.some((s) => s.diagnostic) ?? false,
    onSubmit,
    onResetField,
    onSoftDelete,
    onReset,
  };
}
