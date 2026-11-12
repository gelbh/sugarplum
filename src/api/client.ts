/** Compatibility barrel — prefer domain imports in new code. */
export { ApiError, api, guestUnsupported, type ApiErrorBody } from "./core";
export {
  GAMIFICATION_CHANGED_EVENT,
  notifyGamificationChanged,
} from "./events";
export type * from "./types";
export * from "./auth";
export * from "./catalog";
export * from "./materials";
export * from "./jobs";
export * from "./cards";
export * from "./study";
export * from "./peripheral";
