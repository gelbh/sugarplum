/** trim → NFC → lower; shared by guest import subject/deck title fold. */
export function foldDeckTitle(title: string): string {
  return title.trim().normalize("NFC").toLowerCase();
}
