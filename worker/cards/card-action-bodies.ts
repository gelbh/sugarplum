import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { REJECT_REASONS } from "../../src/lib/rejectReasons";
import { REGEN_CARD_TYPES } from "../generation/card-regen";

export const RejectBodySchema = z.object({
  reason: z.enum(REJECT_REASONS).nullish(),
});

export const MoveBodySchema = z.object({
  deckId: z.string().min(1),
});

export const RegenBodySchema = z.object({
  type: z.enum(REGEN_CARD_TYPES),
});

export function parseRejectBody(body: unknown): {
  reason: (typeof REJECT_REASONS)[number] | null;
} {
  const parsed = RejectBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues[0]?.message ?? "Invalid reject body",
    });
  }
  return { reason: parsed.data.reason ?? null };
}

export function parseMoveBody(body: unknown): { deckId: string } {
  const parsed = MoveBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues[0]?.message ?? "Invalid move body",
    });
  }
  return { deckId: parsed.data.deckId };
}

export function parseRegenBody(body: unknown): {
  type: (typeof REGEN_CARD_TYPES)[number];
} {
  const parsed = RegenBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues[0]?.message ?? "Invalid regen body",
    });
  }
  return { type: parsed.data.type };
}
