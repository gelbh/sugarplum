/**
 * Cycle-safe atlas public surface for composition tops that must not pull the
 * React atlas index barrel. Path helpers only.
 */
export {
  ATLAS_LEGACY_PATH,
  ATLAS_HUB_PATH,
  ATLAS_PATH,
  matchAtlasPath,
  atlasHubHref,
  atlasHref,
  atlasEntryHref,
  atlasCompareHref,
  isAtlasToAtlas,
  atlasHeroName,
  type AtlasRoute,
  type AtlasPathMatch,
} from "./paths";
