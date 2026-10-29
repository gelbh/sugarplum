import { useEffect, useState } from "react";
import { getJob, getJourneyGeneration } from "../api/client";
import { shellGenerationPollMs } from "./shellGenerationPollMs";
import { isGuest } from "../guest/session";
import {
  resolveShellGenerationStatus,
  type ShellGenerationJobInput,
  type ShellGenerationStatus,
} from "./resolveShellGenerationStatus";

const POLL_ERROR_MS = 5_000;

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
        const generation = await getJourneyGeneration();
        if (cancelled || gen !== tickGen) return;

        let pendingJob: ShellGenerationJobInput | null = null;
        if (
          generation.pendingGenerationJobId &&
          !generation.openReviewJobId
        ) {
          try {
            const job = await getJob(generation.pendingGenerationJobId);
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
              openReviewJobId: generation.openReviewJobId,
              pendingGenerationJobId: generation.pendingGenerationJobId,
            },
            pendingJob,
          ),
        );

        const delay = shellGenerationPollMs({
          visibility: document.visibilityState,
          openReviewJobId: generation.openReviewJobId,
          pendingGenerationJobId: generation.pendingGenerationJobId,
        });
        if (!cancelled && gen === tickGen) schedule(delay);
      } catch {
        if (cancelled || gen !== tickGen) return;
        schedule(POLL_ERROR_MS);
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
