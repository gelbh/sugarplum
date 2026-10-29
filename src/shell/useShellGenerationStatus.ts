import { useEffect, useState } from "react";
import { getJob, getJourney } from "../api/client";
import { isGuest } from "../guest/session";
import {
  resolveShellGenerationStatus,
  type ShellGenerationJobInput,
  type ShellGenerationStatus,
} from "./resolveShellGenerationStatus";

const POLL_VISIBLE_MS = 5_000;
const POLL_HIDDEN_MS = 30_000;

export function useShellGenerationStatus(
  hideChrome: boolean,
): ShellGenerationStatus | null {
  const [status, setStatus] = useState<ShellGenerationStatus | null>(null);

  useEffect(() => {
    if (hideChrome || isGuest()) {
      setStatus(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tickGen = 0;
    let inFlight = false;
    let queuedWhileInFlight = false;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void tick();
      }, ms);
    };

    const tick = async () => {
      if (cancelled) return;
      if (inFlight) {
        queuedWhileInFlight = true;
        return;
      }
      inFlight = true;
      const gen = ++tickGen;

      try {
        const journey = await getJourney();
        if (cancelled || gen !== tickGen) return;

        let pendingJob: ShellGenerationJobInput | null = null;
        if (journey.pendingGenerationJobId && !journey.openReviewJobId) {
          try {
            const job = await getJob(journey.pendingGenerationJobId);
            if (cancelled || gen !== tickGen) return;
            pendingJob = {
              id: job.id,
              status: job.status,
              progress: job.progress,
            };
          } catch {
            // Do not invent status "running"; resolver gets null.
            pendingJob = null;
          }
        }
        if (cancelled || gen !== tickGen) return;

        setStatus(
          resolveShellGenerationStatus(
            {
              openReviewJobId: journey.openReviewJobId,
              pendingGenerationJobId: journey.pendingGenerationJobId,
            },
            pendingJob,
          ),
        );

        const delay =
          document.visibilityState === "hidden"
            ? POLL_HIDDEN_MS
            : POLL_VISIBLE_MS;
        if (!cancelled && gen === tickGen) schedule(delay);
      } catch {
        if (cancelled || gen !== tickGen) return;
        schedule(POLL_VISIBLE_MS);
      } finally {
        inFlight = false;
        if (!cancelled && queuedWhileInFlight) {
          queuedWhileInFlight = false;
          void tick();
        }
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void tick();
      }
    };

    void tick();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      tickGen += 1;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hideChrome]);

  return status;
}
