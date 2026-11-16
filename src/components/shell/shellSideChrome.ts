import { TOP_BAND_HEIGHT } from "./chromeTokens";

export type ShellSideChrome = "none" | "top";

/** Magazine shell: phone uses dock; sm+ uses top pictogram band (no side drawer/rail). */
export function resolveShellSideChrome(
  phone: boolean,
  _medium: boolean,
  hideChrome: boolean,
): { side: ShellSideChrome; sideWidth: number; topBand: boolean } {
  if (hideChrome) {
    return { side: "none", sideWidth: 0, topBand: false };
  }
  if (phone) {
    return { side: "none", sideWidth: 0, topBand: false };
  }
  return { side: "top", sideWidth: 0, topBand: true };
}

export function topBandOffsetPx(topBand: boolean): number {
  return topBand ? TOP_BAND_HEIGHT : 0;
}
