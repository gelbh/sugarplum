import {
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedSession,
  seedUser,
} from "./seed";
import type { Bindings } from "./types";

export async function seedAdminMonitorFixture(env: Bindings): Promise<void> {
  await seedUser(env, {
    id: "admin-u",
    email: "ops@example.com",
    password_hash: null,
    oauth_subject: "google-admin",
    created_at: "2025-01-01T00:00:00.000Z",
  });
  await seedUser(env, {
    id: "u-alice",
    email: "alice@example.com",
    password_hash: null,
    oauth_subject: "google-alice",
    created_at: "2026-10-28T00:00:00.000Z",
  });
  await seedUser(env, {
    id: "u-bob",
    email: "bob@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-10-25T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "deck-alice",
    user_id: "u-alice",
    title: "Alice deck",
    subject_hint: null,
    created_at: "2026-10-28T01:00:00.000Z",
  });
  await seedMaterial(env, {
    id: "mat-alice",
    deck_id: "deck-alice",
    kind: "paste",
    r2_key: null,
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-10-28T01:00:00.000Z",
  });
  await seedGenerationJob(env, {
    id: "job-alice",
    material_id: "mat-alice",
    status: "done",
    error: null,
    coverage_json: null,
    progress_json: null,
    created_at: "2026-10-28T02:00:00.000Z",
    finished_at: "2026-10-28T02:05:00.000Z",
  });
  await seedCard(env, {
    id: "card-a1",
    deck_id: "deck-alice",
    job_id: "job-alice",
    type: "qa",
    front_json: "{}",
    back_json: "{}",
    media_r2_keys_json: null,
    provenance_json: null,
    status: "accepted",
    created_at: "2026-10-28T02:10:00.000Z",
    updated_at: "2026-10-28T02:10:00.000Z",
  });
  await seedCard(env, {
    id: "card-a2",
    deck_id: "deck-alice",
    job_id: "job-alice",
    type: "qa",
    front_json: "{}",
    back_json: "{}",
    media_r2_keys_json: null,
    provenance_json: null,
    status: "draft",
    created_at: "2026-10-28T02:11:00.000Z",
    updated_at: "2026-10-28T02:11:00.000Z",
  });
  await seedSession(env, "s-admin", "admin-u");
}
