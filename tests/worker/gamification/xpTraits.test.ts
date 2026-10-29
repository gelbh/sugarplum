import { describe, it, expect } from "vitest";
import { levelFromXp, XP } from "../../../worker/gamification/constants";
import { traitsForAchievement } from "../../../worker/gamification/traits";
import { creditXp } from "../../../worker/gamification/xp";

describe("levelFromXp", () => {
  it("starts at 1", () => expect(levelFromXp(0)).toBe(1));
  it("grows with sqrt curve", () => {
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(400)).toBe(3);
  });
});

describe("traitsForAchievement", () => {
  it("is deterministic per id", () => {
    const a = traitsForAchievement("reviews_1", "common");
    const b = traitsForAchievement("reviews_1", "common");
    expect(a).toEqual(b);
    expect(a.shine).toBeDefined();
    expect(a.status).toBeDefined();
  });
  it("legendary is shinier than common", () => {
    const c = traitsForAchievement("reviews_1", "common");
    const l = traitsForAchievement("plum_scholar", "legendary");
    const order = ["low", "mild", "high", "very_high", "max"] as const;
    expect(order.indexOf(l.shine)).toBeGreaterThan(order.indexOf(c.shine));
  });
});

describe("XP constants", () => {
  it("zeros generation", () => expect(XP.generation).toBe(0));
  it("caps daily review xp", () => expect(XP.reviewDailyCap).toBe(100));
});

type GamificationRow = {
  xp_total: number;
  level: number;
};

/** Minimal D1 mock for xp_ledger + user_gamification (test-env lacks these tables). */
function createGamificationDb(): D1Database {
  const gamification = new Map<string, GamificationRow>();
  const ledgerKeys = new Set<string>();

  function ledgerKey(userId: string, idempotencyKey: string): string {
    return `${userId}\0${idempotencyKey}`;
  }

  function prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    let bound: unknown[] = [];

    const stmt = {
      bind(...args: unknown[]) {
        bound = args;
        return stmt;
      },
      async first<T>(): Promise<T | null> {
        if (
          normalized.startsWith(
            "SELECT xp_total, level FROM user_gamification WHERE user_id =",
          )
        ) {
          const userId = bound[0] as string;
          const row = gamification.get(userId);
          return (row ? { ...row } : null) as T;
        }
        if (
          normalized.startsWith(
            "SELECT xp_total FROM user_gamification WHERE user_id =",
          )
        ) {
          const userId = bound[0] as string;
          const row = gamification.get(userId);
          return (row ? { xp_total: row.xp_total } : null) as T;
        }
        return null;
      },
      async run(): Promise<D1Result> {
        if (normalized.startsWith("INSERT OR IGNORE INTO user_gamification")) {
          const [userId, updatedAt] = bound as [string, string];
          if (!gamification.has(userId)) {
            gamification.set(userId, { xp_total: 0, level: 1 });
            return { success: true, meta: { changes: 1 } } as D1Result;
          }
          void updatedAt;
          return { success: true, meta: { changes: 0 } } as D1Result;
        }
        if (normalized.startsWith("INSERT OR IGNORE INTO xp_ledger")) {
          const [, userId, , , idempotencyKey] = bound as [
            string,
            string,
            number,
            string,
            string,
            string,
          ];
          const key = ledgerKey(userId, idempotencyKey);
          if (ledgerKeys.has(key)) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          ledgerKeys.add(key);
          return { success: true, meta: { changes: 1 } } as D1Result;
        }
        if (normalized.startsWith("UPDATE user_gamification SET xp_total =")) {
          const [xpTotal, level, , userId] = bound as [
            number,
            number,
            string,
            string,
          ];
          gamification.set(userId, { xp_total: xpTotal, level });
          return { success: true, meta: { changes: 1 } } as D1Result;
        }
        return { success: true, meta: { changes: 0 } } as D1Result;
      },
    };
    return stmt;
  }

  return { prepare } as unknown as D1Database;
}

describe("creditXp", () => {
  it("is idempotent for the same idempotency key", async () => {
    const db = createGamificationDb();
    const userId = "user-1";
    const key = "review:log-abc";

    const first = await creditXp(db, userId, 5, "review", key);
    expect(first.awarded).toBe(true);
    expect(first.xpTotal).toBe(5);
    expect(first.level).toBe(1);

    const second = await creditXp(db, userId, 5, "review", key);
    expect(second.awarded).toBe(false);
    expect(second.xpTotal).toBe(5);
    expect(second.level).toBe(1);
  });
});
