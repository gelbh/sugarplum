import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { getCards } from "./inspect";
import { seedCard, seedDeck, seedGenerationJob, seedMaterial, seedSession, seedUser } from "./seed";
import type { Bindings } from "./types";

/** user-a + deck-a + sess-a + mat-a + job-1 (needs_review). Cards draft-review suite default. */
export async function seedCardsReviewOwner(env: Bindings): Promise<void> {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "deck-a",
    user_id: "user-a",
    title: "Bio",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
  await seedMaterial(env, {
    id: "mat-a",
    deck_id: "deck-a",
    kind: "paste",
    r2_key: null,
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedGenerationJob(env, {
    id: "job-1",
    material_id: "mat-a",
    status: "needs_review",
    error: null,
    coverage_json: null,
    progress_json: null,
    created_at: "2026-01-01T00:00:00.000Z",
    finished_at: null,
  });
}

export async function seedNeedsReviewJob(
  env: Bindings,
  opts: {
    jobId: string;
    materialId: string;
    deckId: string;
    cards: { id: string; status?: "draft" | "accepted" }[];
    finishedAt?: string | null;
  },
): Promise<void> {
  await seedMaterial(env, {
    id: opts.materialId,
    deck_id: opts.deckId,
    kind: "paste",
    r2_key: null,
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedGenerationJob(env, {
    id: opts.jobId,
    material_id: opts.materialId,
    status: "needs_review",
    error: null,
    coverage_json: null,
    progress_json: null,
    created_at: "2026-01-01T00:00:00.000Z",
    finished_at: opts.finishedAt ?? null,
  });
  for (const card of opts.cards) {
    await seedCard(env, {
      id: card.id,
      deck_id: opts.deckId,
      job_id: opts.jobId,
      type: "qa",
      front_json: JSON.stringify(`${card.id}?`),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: card.id }),
      status: card.status ?? "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
  }
}

export async function postAcceptAll(
  env: Bindings,
  jobId: string,
): Promise<Response> {
  return app.request(
    `/api/jobs/${jobId}/drafts/accept-all`,
    {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=sess-a` },
    },
    env,
  );
}

/** Flip a draft to accepted after the draft-list `.all()`, simulating a concurrent accept. */
export function withDraftListCasFlip(
  env: Bindings,
  cardId: string,
): Bindings {
  const baseDb = env.DB;
  let flipped = false;
  return {
    ...env,
    DB: new Proxy(baseDb, {
      get(target, prop, _receiver) {
        if (prop !== "prepare") {
          const value = Reflect.get(target, prop, target);
          return typeof value === "function"
            ? (value as (...args: unknown[]) => unknown).bind(target)
            : value;
        }
        return (sql: string) => {
          const wrap = (stmt: D1PreparedStatement): D1PreparedStatement => {
            const originalBind = stmt.bind.bind(stmt);
            const originalAll = stmt.all.bind(stmt);
            (stmt as { bind: typeof stmt.bind }).bind = (...args: unknown[]) =>
              wrap(originalBind(...(args as Parameters<typeof stmt.bind>)));
            (stmt as { all: typeof stmt.all }).all = async <
              T extends Record<string, unknown>,
            >() => {
              const out = await originalAll<T>();
              if (
                !flipped &&
                sql.includes("FROM cards") &&
                sql.includes("job_id =") &&
                sql.includes("status =")
              ) {
                flipped = true;
                const row = (await getCards(env)).find((c) => c.id === cardId);
                if (row) {
                  await seedCard(env, { ...row, status: "accepted" });
                }
              }
              return out;
            };
            return stmt;
          };
          return wrap(target.prepare(sql));
        };
      },
    }),
  };
}
