import { useEffect, useState, type FormEvent } from "react";
import { patchEntry, resetEntry, softDeleteEntry } from "../hub/apiSource";
import { errMessage, parseHostList } from "./atlasMutateHelpers";
import { entryTitles } from "../entry/entryTitles";
import type { AtlasEntryView } from "../types";

type Args = {
  open: boolean;
  atlasId: string;
  entry: AtlasEntryView | null;
  onClose: () => void;
  onDone: () => void;
};

export function useEditEntryDialog({
  open,
  atlasId,
  entry,
  onClose,
  onDone,
}: Args) {
  const [commonName, setCommonName] = useState("");
  const [definitiveHosts, setDefinitiveHosts] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !entry) return;
    setCommonName(entry.commonName ?? "");
    setDefinitiveHosts((entry.fields.definitiveHosts ?? []).join(", "));
    setError(null);
    setBusy(false);
  }, [open, entry]);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!entry) return;
    const common = commonName.trim();
    if (!common) {
      setError("Common name required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchEntry(atlasId, entry.id, {
        commonName: common,
        // Learner edits accept free-text hosts; DatasetFields vocab is dataset-only.
        fields: {
          definitiveHosts: parseHostList(
            definitiveHosts,
          ) as AtlasEntryView["fields"]["definitiveHosts"],
        },
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errMessage(err, "Could not save entry"));
    } finally {
      setBusy(false);
    }
  }

  async function onSoftDelete() {
    if (!entry) return;
    if (!window.confirm(`Soft-delete ${entryTitles(entry).primary}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await softDeleteEntry(atlasId, entry.id);
      onDone();
      onClose();
    } catch (err) {
      setError(errMessage(err, "Could not delete entry"));
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    if (!entry?.originKey) return;
    if (!window.confirm(`Reset ${entryTitles(entry).primary} to the dataset?`))
      return;
    setBusy(true);
    setError(null);
    try {
      await resetEntry(atlasId, entry.id);
      onDone();
      onClose();
    } catch (err) {
      setError(errMessage(err, "Could not reset entry"));
    } finally {
      setBusy(false);
    }
  }

  const canReset = Boolean(entry?.originKey && entry?.editedAt);

  return {
    commonName,
    setCommonName,
    definitiveHosts,
    setDefinitiveHosts,
    busy,
    error,
    canReset,
    onSubmit,
    onSoftDelete,
    onReset,
  };
}
