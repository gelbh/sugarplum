import { useEffect, useState, type FormEvent } from "react";
import { createEntry } from "../hub/apiSource";
import { errMessage } from "./atlasMutateHelpers";
import type { AtlasEntryView, ParasiteGroup } from "../types";

type Args = {
  open: boolean;
  atlasId: string;
  onClose: () => void;
  onDone: (entry: AtlasEntryView) => void;
};

export function useAddEntryDialog({ open, atlasId, onClose, onDone }: Args) {
  const [name, setName] = useState("");
  const [commonName, setCommonName] = useState("");
  const [group, setGroup] = useState<ParasiteGroup | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setCommonName("");
    setGroup("");
    setError(null);
    setBusy(false);
  }, [open]);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const canonicalName = name.trim();
    const common = commonName.trim();
    if (!canonicalName) {
      setError("Canonical name required");
      return;
    }
    if (!common) {
      setError("Common name required");
      return;
    }
    if (!group) {
      setError("Group required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const entry = await createEntry(atlasId, {
        canonicalName,
        commonName: common,
        fields: { group },
      });
      onDone(entry);
      onClose();
    } catch (err) {
      setError(errMessage(err, "Could not add entry"));
    } finally {
      setBusy(false);
    }
  }

  return {
    name,
    setName,
    commonName,
    setCommonName,
    group,
    setGroup,
    busy,
    error,
    onSubmit,
  };
}
