export type MaterialKind = "pdf" | "pptx";

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function materialKindFromJobMaterial(
  kind: string | undefined,
): MaterialKind | null {
  return kind === "pdf" || kind === "pptx" ? kind : null;
}

export async function fetchMaterialBytes(
  downloadUrl: string,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetch(downloadUrl, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(String(response.status));
  return new Uint8Array(await response.arrayBuffer());
}
