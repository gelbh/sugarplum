/** Shared study completion CTA (due cards → study, else Today). */
export type StudyPrimaryCta =
  | { label: "Start study"; href: "/study"; action: "study" }
  | { label: "Go to Today"; href: "/today"; action: "study" };

export function studyPrimaryCta(dueCount: number): StudyPrimaryCta {
  if (dueCount > 0) {
    return { label: "Start study", href: "/study", action: "study" };
  }
  return { label: "Go to Today", href: "/today", action: "study" };
}
