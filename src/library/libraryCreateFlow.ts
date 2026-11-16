/** Never auto-open Add material on Library load; empty Library starts from Add subject. */
export function libraryShowsCreateFlow(_subjectCount: number): boolean {
  return false;
}
