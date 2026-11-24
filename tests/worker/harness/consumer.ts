import { vi } from "vitest";
import { encryptSecret } from "../../../worker/crypto/secrets";
import { enqueueGeneration } from "../../../worker/generation/enqueue";
import { mockLlmAdapter, type LlmAdapter } from "../../../worker/generation/llm";
import { type CardDraft } from "../../../worker/generation/schema";
import {
  seedDeck,
  seedMaterial,
  seedR2,
  seedSession,
  seedUser,
  seedUserSecret,
} from "./seed";
import { TEST_SECRETS_WRAP_KEY, type Bindings } from "./types";

export async function seedConsumerOwner(
  env: Bindings,
  withSecret = false,
): Promise<void> {
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
  return withSecret
    ? encryptSecret("sk-test-mock-key", TEST_SECRETS_WRAP_KEY).then(
        async (ciphertext) => {
          await seedUserSecret(env, {
            user_id: "user-a",
            provider: "mock",
            ciphertext,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          });
        },
      )
    : Promise.resolve();
}

export async function seedPasteJob(env: Bindings, text: string) {
  await seedMaterial(env, {
    id: "mat-1",
    deck_id: "deck-a",
    kind: "paste",
    r2_key: "materials/deck-a/mat-1.txt",
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedR2(env, "materials/deck-a/mat-1.txt", text);
  const jobId = await enqueueGeneration(env, {
    materialId: "mat-1",
    deckId: "deck-a",
  });
  return { jobId, materialId: "mat-1", deckId: "deck-a" };
}

export function spyLlm(base: LlmAdapter = mockLlmAdapter()): LlmAdapter & {
  generateDrafts: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
} {
  return {
    generateDrafts: vi.fn(base.generateDrafts.bind(base)),
    complete: vi.fn(base.complete.bind(base)),
  };
}

/** Parse critique user prompt candidates and keep those whose front is allowlisted. */
export function critiqueKeepFronts(keepFronts: Set<string> | string[]) {
  const allow = keepFronts instanceof Set ? keepFronts : new Set(keepFronts);
  return async ({ user }: { user: string }) => {
    const marker = "Candidate cards (JSON):\n";
    const start = user.indexOf(marker);
    if (start < 0) throw new Error("critique prompt missing candidates");
    const jsonStart = start + marker.length;
    const end = user.indexOf("\n\nReturn only", jsonStart);
    const raw = end >= 0 ? user.slice(jsonStart, end) : user.slice(jsonStart);
    const candidates = JSON.parse(raw) as CardDraft[];
    return {
      text: JSON.stringify({
        cards: candidates.filter((c) => allow.has(c.front)),
      }),
      usage: null,
    };
  };
}

/** Echo all critique candidates (rules-only path with no drops). */
export function critiqueEchoCandidates() {
  return async ({ user }: { user: string }) => {
    const marker = "Candidate cards (JSON):\n";
    const start = user.indexOf(marker);
    if (start < 0) throw new Error("critique prompt missing candidates");
    const jsonStart = start + marker.length;
    const end = user.indexOf("\n\nReturn only", jsonStart);
    const raw = end >= 0 ? user.slice(jsonStart, end) : user.slice(jsonStart);
    return {
      text: JSON.stringify({ cards: JSON.parse(raw) }),
      usage: null,
    };
  };
}
