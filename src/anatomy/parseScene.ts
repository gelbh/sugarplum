import { z } from "zod";
import type { AnatomySceneManifest } from "./types";

const StructureInfoSchema = z.object({
  summary: z.string().optional(),
  alsoKnownAs: z.array(z.string().min(1)).optional(),
});

const StructureSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  node: z.string().min(1),
  asset: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  info: StructureInfoSchema.optional(),
});

const RegionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  defaultActive: z.boolean().optional(),
});

const ManifestSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    asset: z.string().min(1).optional(),
    regions: z.array(RegionSchema).min(1).optional(),
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
    } else if (withoutAsset.length > 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "multi-asset scenes require asset on every structure (or a top-level asset)",
        path: ["structures"],
      });
    }

    if (!data.regions) {
      return;
    }
    const regionIds = new Set(data.regions.map((r) => r.id));
    data.structures.forEach((s, i) => {
      if (!s.region) {
        ctx.addIssue({
          code: "custom",
          message: "structures require region when regions are listed",
          path: ["structures", i, "region"],
        });
        return;
      }
      if (!regionIds.has(s.region)) {
        ctx.addIssue({
          code: "custom",
          message: `unknown region "${s.region}"`,
          path: ["structures", i, "region"],
        });
      }
    });
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

/** Region ids that should load on first open. */
export function defaultActiveRegionIds(
  manifest: AnatomySceneManifest,
): string[] {
  const regions = manifest.regions;
  if (!regions?.length) return [];
  const marked = regions.filter((r) => r.defaultActive).map((r) => r.id);
  if (marked.length > 0) return marked;
  return [regions[0].id];
}

/**
 * Prefer `?region=` ids that exist on the manifest; otherwise default actives.
 * Unknown query ids are dropped (no inventing regions).
 */
export function activeRegionIdsForOpen(
  manifest: AnatomySceneManifest,
  requested: string[],
): string[] {
  const known = new Set((manifest.regions ?? []).map((r) => r.id));
  const matched = requested.filter((id) => known.has(id));
  if (matched.length > 0) return matched;
  return defaultActiveRegionIds(manifest);
}
