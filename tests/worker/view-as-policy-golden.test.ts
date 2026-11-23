import { describe, expect, it } from "vitest";
import {
  VIEW_AS_BLOCKED_GET_EXACT,
  VIEW_AS_BLOCKED_GET_PREFIXES,
  isViewAsBlockedGetPath,
} from "../../worker/admin/impersonation";
import { VIEW_AS_MUTATE_ALLOW } from "../../worker/admin/viewAsRoutePolicy";

/** Frozen SoT - update only with intentional policy PRs. */
const EXPECT_MUTATE_ALLOW = [
  "/api/auth/logout",
  "/api/admin/impersonation/exit",
] as const;

const EXPECT_BLOCKED_GET_EXACT = [
  "/api/calendar/connect",
  "/api/calendar/callback",
  "/api/settings/study/fsrs-optimize",
] as const;

const EXPECT_BLOCKED_GET_PREFIXES = ["/api/auth/google"] as const;

describe("view-as policy golden", () => {
  it("freezes mutate allowlist membership", () => {
    expect([...VIEW_AS_MUTATE_ALLOW].sort()).toEqual(
      [...EXPECT_MUTATE_ALLOW].sort(),
    );
  });

  it("freezes blocked GET exact paths and prefixes", () => {
    expect([...VIEW_AS_BLOCKED_GET_EXACT].sort()).toEqual(
      [...EXPECT_BLOCKED_GET_EXACT].sort(),
    );
    expect([...VIEW_AS_BLOCKED_GET_PREFIXES].sort()).toEqual(
      [...EXPECT_BLOCKED_GET_PREFIXES].sort(),
    );
  });

  it("prefix still blocks google children", () => {
    expect(isViewAsBlockedGetPath("/api/auth/google/callback")).toBe(true);
    expect(isViewAsBlockedGetPath("/api/decks")).toBe(false);
  });
});
