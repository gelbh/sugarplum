/** Homepage purpose copy shared by UI and tests. */
export const HOME_BRAND = "Sugarplum";

export const HOME_TAGLINE =
  "Spaced-repetition study with AI-assisted flashcard drafts.";

export const HOME_PURPOSE =
  "Turn your notes into flashcards, then review on a schedule.";

/** Demo Q/A on the public foyer preview card (not live study data). */
export const HOME_DEMO_FRONT = "What is spaced repetition?";
export const HOME_DEMO_BACK =
  "Reviewing just before you forget, so memory sticks with less time.";

export function homePlainText(): string {
  return [HOME_BRAND, HOME_TAGLINE, HOME_PURPOSE].join("\n\n");
}
