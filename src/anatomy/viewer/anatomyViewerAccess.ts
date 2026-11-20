export function sessionAnatomyViewerEnabled(
  user: { anatomy_viewer?: boolean } | null | undefined,
): boolean {
  return user?.anatomy_viewer === true;
}
