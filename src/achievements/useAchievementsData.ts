import { useEffect, useState } from "react";
import {
  ApiError,
  getAchievements,
  getGamification,
  getWeeklyLeaderboard,
  me,
  type AchievementItemView,
  type GamificationResponse,
  type LeaderboardResponse,
} from "../api/client";
import { isGuest } from "../guest/session";
import { useTrackedOp } from "../progress/useTrackedOp";

export type AchievementsData = {
  ready: boolean;
  guest: boolean;
  error: string | null;
  items: AchievementItemView[];
  gamification: GamificationResponse | null;
  board: LeaderboardResponse | null;
};

const INITIAL: AchievementsData = {
  ready: false,
  guest: false,
  error: null,
  items: [],
  gamification: null,
  board: null,
};

export function useAchievementsData(): AchievementsData {
  const [data, setData] = useState<AchievementsData>(INITIAL);
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
            setData({ ...INITIAL, ready: true, guest: true });
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
          ready: true,
          guest: false,
          error: null,
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
          ...INITIAL,
          ready: true,
          error:
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
