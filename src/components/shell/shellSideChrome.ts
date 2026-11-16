import { DRAWER_WIDTH, RAIL_WIDTH } from "./chromeTokens";

export type ShellSideChrome = "none" | "rail" | "drawer";

/**
 * Phone: none (bottom dock). Desktop: rail (icons) or drawer (icons + text).
 * `collapsed` null keeps the viewport default (rail on medium, drawer on large).
 */
export function resolveShellSideChrome(
  phone: boolean,
  medium: boolean,
  hideChrome: boolean,
  collapsed: boolean | null = null,
): { side: ShellSideChrome; sideWidth: number } {
  if (hideChrome || phone) {
    return { side: "none", sideWidth: 0 };
  }
  const useRail = collapsed ?? medium;
  if (useRail) {
    return { side: "rail", sideWidth: RAIL_WIDTH };
  }
  return { side: "drawer", sideWidth: DRAWER_WIDTH };
}
