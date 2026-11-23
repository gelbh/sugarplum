import { isViewAsBlockedGetPath } from "./impersonation";

/**
 * View-as mutate allowlist (default deny). Intentional widen requires the same PR to update:
 * (1) this SoT array, (2) EXPECT_* in tests/worker/view-as-policy-golden.test.ts,
 * (3) keep tests/worker/view-as-route-annotations.test.ts green.
 * Do not silently widen; exit + logout only until a named product need.
 */
export const VIEW_AS_MUTATE_ALLOW = [
  "/api/auth/logout",
  "/api/admin/impersonation/exit",
] as const;

const MUTATE_ALLOW = new Set<string>(VIEW_AS_MUTATE_ALLOW);

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type ViewAsAnnotation = "allow" | "deny";

/** Expected annotation given method + full mounted path (runtime SoT mirror). */
export function expectedViewAsAnnotation(
  method: string,
  fullPath: string,
): ViewAsAnnotation {
  const m = method.toUpperCase();
  if (MUTATING.has(m)) {
    return MUTATE_ALLOW.has(fullPath) ? "allow" : "deny";
  }
  if (m === "GET" && isViewAsBlockedGetPath(fullPath)) {
    return "deny";
  }
  return "allow";
}

export function isViewAsMutateAllowedPath(path: string): boolean {
  return MUTATE_ALLOW.has(path);
}
