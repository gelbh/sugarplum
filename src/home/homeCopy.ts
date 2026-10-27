/** Homepage purpose copy shared by UI and tests. */
export const HOME_BRAND = "Sugarplum";

export const HOME_TAGLINE =
  "Spaced-repetition study with AI-assisted flashcard drafts.";

export const HOME_PURPOSE = [
  "Sugarplum helps you learn with spaced repetition. Upload or paste study materials, generate flashcard drafts with AI (Workers AI or your own API keys), then review cards on a schedule.",
  "Sign in with email or optionally with Google. When you use Google Sign-In, we use it only to identify your Sugarplum account (verified email and a stable Google subject id). We do not use Google data for advertising.",
].join("\n\n");

export function homePlainText(): string {
  return [HOME_BRAND, HOME_TAGLINE, HOME_PURPOSE].join("\n\n");
}
