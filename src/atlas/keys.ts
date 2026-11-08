/** True when a bare-key shortcut should act: no modifiers and focus is not in a text field. */
export function isShortcutTarget(ev: KeyboardEvent): boolean {
  if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey)
    return false;
  const el = ev.target;
  if (!(el instanceof HTMLElement)) return true;
  return !(
    el.isContentEditable ||
    el.closest("input, textarea, select, [role='combobox'], [role='slider']")
  );
}
