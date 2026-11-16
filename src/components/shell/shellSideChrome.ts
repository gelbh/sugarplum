import { DRAWER_WIDTH, RAIL_WIDTH } from "./chromeTokens";

export type ShellSideChrome = "none" | "rail" | "drawer";

export function resolveShellSideChrome(
  phone: boolean,
  medium: boolean,
  hideChrome: boolean,
): { side: ShellSideChrome; sideWidth: number } {
  if (hideChrome || phone) {
    return { side: "none", sideWidth: 0 };
  }
  if (medium) {
    return { side: "rail", sideWidth: RAIL_WIDTH };
  }
  return { side: "drawer", sideWidth: DRAWER_WIDTH };
}
