import type { Env } from "../env";
import type { ExportScope } from "./types";

async function loadSubjectDeckIds(
  env: Env,
  userId: string,
  subjectId: string,
): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT id FROM decks
     WHERE user_id = ? AND subject_id = ?
     ORDER BY created_at ASC`,
  )
    .bind(userId, subjectId)
    .all<{ id: string }>();

  return (results ?? []).map((row) => row.id);
}

/** Returns ordered unique owned deck ids. Unknown/foreign ids omitted (not 404). */
export async function resolveExportDeckIds(
  env: Env,
  userId: string,
  scope: ExportScope,
): Promise<string[]> {
  switch (scope.type) {
    case "deck":
      // Ownership stays with the deck loader (P1 404), not soft-omit here.
      return [scope.deckId];
    case "subject":
      return loadSubjectDeckIds(env, userId, scope.subjectId);
    case "selection": {
      const seen = new Set<string>();
      const out: string[] = [];
      const add = (id: string) => {
        if (seen.has(id)) return;
        seen.add(id);
        out.push(id);
      };

      for (const subjectId of scope.subjectIds) {
        for (const id of await loadSubjectDeckIds(env, userId, subjectId)) {
          add(id);
        }
      }

      for (const deckId of scope.deckIds) {
        const owned = await env.DB.prepare(
          "SELECT id FROM decks WHERE id = ? AND user_id = ?",
        )
          .bind(deckId, userId)
          .first<{ id: string }>();
        if (owned) add(owned.id);
      }

      return out;
    }
    default: {
      const _exhaustive: never = scope;
      return _exhaustive;
    }
  }
}
