const AUTH_ENTRY = new Set(["/", "", "/login", "/register"]);
const LEGAL = new Set(["/privacy", "/terms", "/data-deletion"]);
const AUTH_FORMS = new Set(["/login", "/register"]);

export type SessionRouteDecision =
  | { action: "allow" }
  | { action: "redirect"; to: string }
  | { action: "pending" };

export type SessionRouteStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

export type SessionRouteOpts = {
  /** Guest sessions stay authenticated for app routes but must reach login/register to upgrade. */
  guest?: boolean;
};

export function sessionRouteDecision(
  pathname: string,
  status: SessionRouteStatus,
  opts: SessionRouteOpts = {},
): SessionRouteDecision {
  if (status === "loading") {
    // LEGAL paints during cold resolve; everything else waits.
    return LEGAL.has(pathname) ? { action: "allow" } : { action: "pending" };
  }

  if (status === "error") {
    // Public entry + legal stay reachable when /me is down; app shell waits for Retry.
    if (LEGAL.has(pathname) || AUTH_ENTRY.has(pathname)) {
      return { action: "allow" };
    }
    return { action: "pending" };
  }

  if (AUTH_ENTRY.has(pathname)) {
    if (status !== "authenticated") {
      return { action: "allow" };
    }
    // Guests keep /login and /register so Create account / Sign in CTAs can merge.
    if (opts.guest && AUTH_FORMS.has(pathname)) {
      return { action: "allow" };
    }
    return { action: "redirect", to: "/today" };
  }

  if (LEGAL.has(pathname)) {
    return { action: "allow" };
  }

  return status === "authenticated"
    ? { action: "allow" }
    : { action: "redirect", to: "/login" };
}
