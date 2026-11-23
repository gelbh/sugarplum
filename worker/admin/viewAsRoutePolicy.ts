import { isViewAsBlockedGetPath } from "./impersonation";

/** Exact paths that may mutate while view-as (Exit + logout). */
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
