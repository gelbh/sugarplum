export function navigate(path: string): void {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function subscribePath(listener: (path: string) => void): () => void {
  const handler = () => listener(window.location.pathname);
  window.addEventListener("popstate", handler);
  return () => window.removeEventListener("popstate", handler);
}

export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function canGoBack(): boolean {
  const nav = (window as Window & { navigation?: { canGoBack?: boolean } })
    .navigation;
  if (typeof nav?.canGoBack === "boolean") return nav.canGoBack;
  return window.history.length > 1;
}
