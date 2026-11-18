/**
 * Whether a text input should grab focus on mount. On touch-primary devices
 * focusing a text field pops the on-screen keyboard, which covers the page the
 * user just opened — so only auto-focus where there is a fine pointer.
 */
export function shouldAutoFocusText(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return !window.matchMedia("(pointer: coarse)").matches;
}
