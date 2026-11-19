/**
 * Whether a text input should grab focus on mount when a page or dialog opens.
 * On touch-primary devices focusing a text field pops the on-screen keyboard,
 * which covers the surface the user just opened - so only auto-focus where
 * there is a fine pointer. Use for surface-open text fields / programmatic
 * search focus only; not dialog Button autofocus, and not text controls that
 * mount after an explicit edit gesture.
 */
export function shouldAutoFocusText(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return true;
  }
  return !window.matchMedia("(pointer: coarse)").matches;
}
