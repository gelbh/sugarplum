import { useCallback, useRef, useState } from "react";
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

  const playGradeMailboxMotion = useCallback(
    (rating: StudyRating) => {
      const host = cardHostRef.current;
      if (!host) return;
      const from = studyCardFlightSource(host);
      const to = gradeMailboxEl(rating);
      if (!from || !to) return;

      holdCountRef.current += 1;
      flightBusyRef.current = true;
      setMailboxHold(true);
      void flyCardToGrade(from, to, { rating }).finally(() => {
        holdCountRef.current = Math.max(0, holdCountRef.current - 1);
        if (holdCountRef.current === 0) {
          flightBusyRef.current = false;
          setMailboxHold(false);
        }
      });
    },
    [cardHostRef],
  );

  return { mailboxHold, flightBusyRef, playGradeMailboxMotion };
}
