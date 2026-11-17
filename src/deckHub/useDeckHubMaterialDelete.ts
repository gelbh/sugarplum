import { useState, type Dispatch, type SetStateAction } from "react";
import {
  ApiError,
  deleteMaterial,
  type MaterialListItem,
} from "../api/client";

type Args = {
  refreshMaterials: () => void | Promise<void>;
  refreshDraftJobs: () => void | Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
};

export function useDeckHubMaterialDelete({
  refreshMaterials,
  refreshDraftJobs,
  setError,
  setNotice,
}: Args) {
  const [deleteMaterialTarget, setDeleteMaterialTarget] =
    useState<MaterialListItem | null>(null);
  const [deleteMaterialBusy, setDeleteMaterialBusy] = useState(false);

  async function confirmDeleteMaterial() {
    if (!deleteMaterialTarget || deleteMaterialBusy) return;
    setDeleteMaterialBusy(true);
    setError(null);
    try {
      await deleteMaterial(deleteMaterialTarget.id);
      setDeleteMaterialTarget(null);
      setNotice("File deleted");
      await Promise.all([refreshMaterials(), refreshDraftJobs()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete file");
    } finally {
      setDeleteMaterialBusy(false);
    }
  }

  return {
    deleteMaterialTarget,
    setDeleteMaterialTarget,
    deleteMaterialBusy,
    confirmDeleteMaterial,
  };
}
