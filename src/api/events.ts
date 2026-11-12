export const GAMIFICATION_CHANGED_EVENT = "sugarplum:gamification-changed";

export function notifyGamificationChanged<T>(result: T): T {
  window.dispatchEvent(new Event(GAMIFICATION_CHANGED_EVENT));
  return result;
}
