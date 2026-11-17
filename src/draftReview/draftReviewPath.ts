export function jobIdFromPath(
  pathname: string = window.location.pathname,
): string | null {
  const match = pathname.match(/^\/jobs\/([^/]+)\/drafts\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
