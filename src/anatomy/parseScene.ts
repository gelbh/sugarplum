import { z } from "zod";
import type { AnatomySceneManifest } from "./types";

const StructureSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  node: z.string().min(1),
});

const ManifestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  asset: z.string().min(1),
  structures: z.array(StructureSchema).min(1),
});

export function parseAnatomySceneManifest(
  input: unknown,
): AnatomySceneManifest {
  const parsed = ManifestSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "invalid manifest";
    const path = parsed.error.issues[0]?.path?.join(".") ?? "";
    throw new Error(
      path ? `Invalid anatomy scene manifest (${path}): ${msg}` : msg,
    );
  }
  return parsed.data;
}
