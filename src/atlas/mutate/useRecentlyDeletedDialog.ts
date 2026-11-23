import { useEffect, useState } from "react";
import {
  listDeletedEntries,
  purgeDeletedEntry,
  restoreEntry,
} from "../hub/apiSource";
import { errMessage } from "./atlasMutateHelpers";
import { entryTitles } from "../lib/entryTitles";
import type { AtlasEntryView } from "../types";

type Args = {
  open: boolean;
  atlasId: string;
  onChanged: () => void;
};

export function useRecentlyDeletedDialog({
  open,
  atlasId,
  onChanged,
}: Args) {
  const [entries, setEntries] = useState<AtlasEntryView[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEntries(null);
    setError(null);
    (async () => {
      try {
        const list = await listDeletedEntries(atlasId);
        if (!cancelled) setEntries(list);
      } catch (err) {
        if (!cancelled) {
          setError(errMessage(err, "Could not load deleted entries"));
          setEntries([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, atlasId]);

  async function onRestore(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await restoreEntry(atlasId, id);
      setEntries((prev) => (prev ?? []).filter((e) => e.id !== id));
      onChanged();
    } catch (err) {
      setError(errMessage(err, "Could not restore entry"));
    } finally {
      setBusyId(null);
    }
  }

  async function onPurge(entry: AtlasEntryView) {
    if (!window.confirm(`Permanently delete ${entryTitles(entry).primary}?`))
      return;
    setBusyId(entry.id);
    setError(null);
    try {
      await purgeDeletedEntry(atlasId, entry.id);
      setEntries((prev) => (prev ?? []).filter((e) => e.id !== entry.id));
      onChanged();
    } catch (err) {
      setError(errMessage(err, "Could not permanently delete entry"));
    } finally {
      setBusyId(null);
    }
  }

  return {
    entries,
    busyId,
    error,
    onRestore,
    onPurge,
  };
}
