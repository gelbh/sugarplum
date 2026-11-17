export function jobIdFromPath(
  pathname: string = window.location.pathname,
): string | null {
  const match = pathname.match(/^\/jobs\/([^/]+)\/drafts\/?$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
