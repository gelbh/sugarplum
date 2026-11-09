/** SubjectPage Atlas CTA: signed-in only; guests get a sign-in prompt. */
export type SubjectAtlasAction =
  | { kind: "sign-in"; label: string }
  | { kind: "add"; label: string }
  | { kind: "open"; label: string };

export function subjectAtlasAction(
  guest: boolean,
  hasAtlas: boolean,
): SubjectAtlasAction {
  if (guest) {
    return {
      kind: "sign-in",
      label: "Sign in to add a Parasitology Atlas",
    };
  }
  if (!hasAtlas) {
    return { kind: "add", label: "Add Parasitology Atlas" };
  }
  return { kind: "open", label: "Parasitology Atlas" };
}
