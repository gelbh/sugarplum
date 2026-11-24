import defSeedsJson from "./gamification-def-seeds.json";

/** One achievement_defs row as the migrations leave it. */
export type AchievementDefSeed = {
  id: string;
  category: string;
  fruit_type: string;
  rarity: string;
  trigger_kind: string;
  threshold: number | null;
  params_json: string | null;
  title: string;
  description: string;
  sort_order: number;
  active: number;
  catalog_version: number;
};

/**
 * Snapshot of achievement_defs after all migrations.
 * workerd cannot run node:sqlite; refresh JSON when defs migrations change:
 *   node --input-type=module -e '...' (see task-4 / schema tests)
 */
export const ACHIEVEMENT_DEF_SEEDS: AchievementDefSeed[] =
  defSeedsJson as AchievementDefSeed[];
