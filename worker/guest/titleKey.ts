/** Fold deck titles for guest-import match: trim → NFC → lower. */
export function foldDeckTitle(title: string): string {
  return title.trim().normalize("NFC").toLowerCase();
}
