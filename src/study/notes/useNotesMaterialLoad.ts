import { useEffect, useState } from "react";
import {
  downloadMaterialUrl,
  getJob,
  listMaterials,
} from "../../api/client";
import { isGuest } from "../../guest/session";

export type MaterialKind = "pdf" | "pptx";

const FILE_ERROR = "Could not open the file.";

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function materialKindFromJobMaterial(
  kind: string | undefined,
): MaterialKind | null {
  return kind === "pdf" || kind === "pptx" ? kind : null;
}

/** Loads notes material bytes/kind/title for an open study notes dialog. */
export function useNotesMaterialLoad({
  open,
  jobId,
  page,
}: {
  open: boolean;
  jobId: string | null;
  page: number | null;
}): {
  title: string;
  error: string | null;
  materialKind: MaterialKind | null;
  materialBytes: Uint8Array | null;
} {
  const [title, setTitle] = useState("Notes");
  const [error, setError] = useState<string | null>(null);
  const [materialKind, setMaterialKind] = useState<MaterialKind | null>(null);
  const [materialBytes, setMaterialBytes] = useState<Uint8Array | null>(null);

  useEffect(() => {
    if (!open || !jobId || isGuest()) {
      setTitle("Notes");
      setError(null);
      setMaterialKind(null);
      setMaterialBytes(null);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setTitle("Notes");
    setError(null);
    setMaterialKind(null);
    setMaterialBytes(null);

    void (async () => {
      try {
        // Material stays on the source deck after a card move; resolve by id.
        const [job, materials] = await Promise.all([
          getJob(jobId),
          listMaterials(),
        ]);
        if (cancelled) return;
        const material = materials.find((item) => item.id === job.material_id);
        if (!material) {
          setError(FILE_ERROR);
          return;
        }
        setTitle(material.filename || "Notes");
        const kind = materialKindFromJobMaterial(material.kind);
        if (!kind || page === null) return;
        const response = await fetch(downloadMaterialUrl(material.id), {
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        setMaterialKind(kind);
        setMaterialBytes(bytes);
      } catch (err) {
        if (cancelled || isAbort(err)) return;
        setError(FILE_ERROR);
        setMaterialKind(null);
        setMaterialBytes(null);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [open, jobId, page]);

  return { title, error, materialKind, materialBytes };
}
