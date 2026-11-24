import {
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedSession,
  seedStudyClaim,
  seedUser,
} from "./seed";
import type { Bindings } from "./types";

export async function seedClaimsNeedsReviewOwner(env: Bindings): Promise<void> {
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
    id: "job-a",
    material_id: "mat-a",
    status: "needs_review",
    error: null,
    coverage_json: null,
    progress_json: null,
    created_at: "2026-01-01T01:00:00.000Z",
    finished_at: "2026-01-01T01:05:00.000Z",
  });
}

export async function seedClaimsNeedsReviewOwnerWithSession(
  env: Bindings,
): Promise<void> {
  await seedClaimsNeedsReviewOwner(env);
  await seedSession(env, "sess-a", "user-a");
}

export async function seedClaimsOrphan(
  env: Bindings,
  args: {
    id: string;
    subject: string;
    predicate?: string;
    span: string;
    createdAt: string;
  },
): Promise<void> {
  await seedStudyClaim(env, {
    id: args.id,
    job_id: "job-a",
    deck_id: "deck-a",
    subject: args.subject,
    predicate: args.predicate ?? "fact",
    object: null,
    source_span: args.span,
    qualifiers_json: null,
    pages_json: "[1]",
    created_at: args.createdAt,
  });
}
