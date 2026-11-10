import { useCallback, useEffect, useRef, useState } from "react";
import type { StudyRating } from "../api/client";
import {
  flyCardToGrade,
  gradeMailboxEl,
  studyCardFlightSource,
} from "./flyCardToGrade";

/** Owns mailbox hold + in-flight gate so StudyPage does not grow another boolean tangle. */
export function useGradeMailboxFlight(cardHostRef: {
  current: HTMLElement | null;
}) {
  const [mailboxHold, setMailboxHold] = useState(false);
  const holdCountRef = useRef(0);
  const flightBusyRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const playGradeMailboxMotion = useCallback(
    (rating: StudyRating): Promise<void> => {
      const host = cardHostRef.current;
      if (!host) return Promise.resolve();
      const from = studyCardFlightSource(host);
      const to = gradeMailboxEl(rating);
      if (!from || !to) return Promise.resolve();

      holdCountRef.current += 1;
      flightBusyRef.current = true;
      setMailboxHold(true);
      const release = () => {
        holdCountRef.current = Math.max(0, holdCountRef.current - 1);
        if (holdCountRef.current === 0 && mountedRef.current) {
          flightBusyRef.current = false;
          setMailboxHold(false);
        }
      };

      // Flight must not stick the gate or abort grade/advance if WAAPI throws.
      let flight: Promise<void>;
      try {
        flight = flyCardToGrade(from, to, { rating });
      } catch {
        flight = Promise.resolve();
      }
      return flight.catch(() => {}).finally(release);
    },
    [cardHostRef],
  );

  return { mailboxHold, flightBusyRef, playGradeMailboxMotion };
}
