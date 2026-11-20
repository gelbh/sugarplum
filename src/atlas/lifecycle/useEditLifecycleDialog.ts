import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  diagnosticMirrorForSave,
  diagnosticOwnershipIssue,
  hydrateLifecycleDraft,
} from "../../../worker/atlas/lifecycleDiagnostic";
import { lifecycleStageSchema } from "../../../worker/atlas/templates/parasite";
import { patchEntry } from "../hub/apiSource";
import { errMessage, previewLifecycleFields } from "../mutate/atlasMutateHelpers";
import type { StageDraft } from "./StageListEditor";
import type { AtlasEntryView, DatasetFields } from "../types";

type Args = {
  open: boolean;
  atlasId: string;
  entry: AtlasEntryView | null;
  onClose: () => void;
  onDone: () => void;
};

export function useEditLifecycleDialog({
  open,
  atlasId,
  entry,
  onClose,
  onDone,
}: Args) {
  const [stages, setStages] = useState<StageDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !entry) return;
    setStages(
      hydrateLifecycleDraft(
        structuredClone(entry.fields.lifecycleStages),
        entry.fields.diagnosticStage,
      ),
    );
    setError(null);
    setBusy(false);
  }, [open, entry]);

  const previewFields = useMemo((): DatasetFields | null => {
    if (!entry) return null;
    return previewLifecycleFields(entry.fields, stages);
  }, [entry, stages]);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = stages.map((s) => lifecycleStageSchema.parse(s));
      const ownershipError = diagnosticOwnershipIssue(parsed, null);
      if (ownershipError) {
        setError(
          ownershipError === "at most one diagnostic stage"
            ? "At most one diagnostic stage"
            : ownershipError,
        );
        setBusy(false);
        return;
      }
      const imageIds = new Set(entry.images.map((img) => img.id));
      for (const s of parsed) {
        if (s.imageId && !imageIds.has(s.imageId)) {
          setError(`Unknown image id: ${s.imageId}`);
          setBusy(false);
          return;
        }
      }
      const diagnosticStage = diagnosticMirrorForSave(
        parsed,
        entry.fields.diagnosticStage,
      );
      await patchEntry(atlasId, entry.id, {
        fields: {
          lifecycleStages: parsed as DatasetFields["lifecycleStages"],
          diagnosticStage,
        },
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errMessage(err, "Could not save lifecycle"));
    } finally {
      setBusy(false);
    }
  }

  return {
    stages,
    setStages,
    busy,
    error,
    previewFields,
    onSubmit,
  };
}
