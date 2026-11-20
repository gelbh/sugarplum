import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import type { CardRegenOpRow } from "../generation/card-regen-op";
import { requireOwnedCard } from "./ownership";
import { serializeCard, type CardRow } from "./serialize";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export const cardRegenOpRoutes = new Hono<AppEnv>();

cardRegenOpRoutes.get("/:opId", async (c) => {
  const userId = await requireUser(c);
  const opId = c.req.param("opId");
  const db = getDb(c.env);
  const op = await db
    .prepare(
      `SELECT id, card_id, user_id, regen_type, status, error, created_at, finished_at
       FROM card_regen_ops WHERE id = ?`,
    )
    .bind(opId)
    .first<CardRegenOpRow>();
  if (!op || op.user_id !== userId) {
    throw new HTTPException(404, { message: "Card regen op not found" });
  }

  const body: {
    id: string;
    cardId: string;
    status: string;
    error: string | null;
    finishedAt: string | null;
    card?: ReturnType<typeof serializeCard>;
  } = {
    id: op.id,
    cardId: op.card_id,
    status: op.status,
    error: op.error,
    finishedAt: op.finished_at,
  };

  if (op.status === "done") {
    const row = await requireOwnedCard(db, op.card_id, userId).catch(
      () => null,
    );
    if (row) {
      body.card = serializeCard(row as CardRow);
    }
  }

  return c.json(body);
});
