import { useEffect, useState } from "react";
import {
  ApiError,
  getAchievements,
  getGamification,
  getWeeklyLeaderboard,
  me,
  type GamificationResponse,
  type LeaderboardResponse,
} from "../api/client";
import { isGuest } from "../guest/session";
import { useTrackedOp } from "../progress/useTrackedOp";
import type { AchievementItem } from "./wire";

export type AchievementsData =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      items: AchievementItem[];
      gamification: GamificationResponse | null;
      board: LeaderboardResponse | null;
    };

export function useAchievementsData(): AchievementsData {
  const [data, setData] = useState<AchievementsData>({ status: "loading" });
  const { end: endLoad } = useTrackedOp("Loading achievements…", {
    trackOnMount: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        if (isGuest()) {
          if (!cancelled) {
            setData({ status: "guest" });
            endLoad();
          }
          return;
        }
        // Summary + board are garnish; the medal grid must still render without them.
        const [ach, gam, lb] = await Promise.all([
          getAchievements(),
          getGamification().catch(() => null),
          getWeeklyLeaderboard().catch(() => null),
        ]);
        if (cancelled) return;
        setData({
          status: "ready",
          items: ach.items,
          gamification: gam,
          board: lb,
        });
        endLoad();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setData({
          status: "error",
          message:
            err instanceof ApiError
              ? err.message
              : "Failed to load achievements",
        });
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad]);

  return data;
}
