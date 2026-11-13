import { z } from "zod";
import type { AnatomySceneManifest } from "./types";

const StructureSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  node: z.string().min(1),
  asset: z.string().min(1).optional(),
});

const ManifestSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    asset: z.string().min(1).optional(),
    structures: z.array(StructureSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const withAsset = data.structures.filter((s) => s.asset);
    const withoutAsset = data.structures.filter((s) => !s.asset);
    if (data.asset) {
      if (withAsset.length > 0) {
        ctx.addIssue({
          code: "custom",
          message:
            "mixed packaging: top-level asset cannot combine with structure.asset",
          path: ["asset"],
        });
      }
      return;
    }
    if (withoutAsset.length > 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "multi-asset scenes require asset on every structure (or a top-level asset)",
        path: ["structures"],
      });
    }
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

/** Relative package path under /anatomy/<sceneId>/; null if unsafe. */
export function safeAnatomyRelativeAsset(raw: string): string | null {
  const asset = raw.replace(/^\.\//, "");
  if (
    !asset ||
    asset.includes("..") ||
    asset.startsWith("/") ||
    asset.includes("\\")
  ) {
    return null;
  }
  return asset;
}
