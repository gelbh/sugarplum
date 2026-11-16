import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  ApiError,
  disconnectCalendar,
  type CalendarStatus,
} from "../api/client";

type Args = {
  setCalendarBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setCalendarStatus: Dispatch<SetStateAction<CalendarStatus | null>>;
};

export function useSettingsCalendar({
  setCalendarBusy,
  setError,
  setNotice,
  setCalendarStatus,
}: Args) {
  const onDisconnectCalendar = useCallback(async () => {
    setCalendarBusy(true);
    setError(null);
    try {
      await disconnectCalendar();
      setCalendarStatus({
        connected: false,
        suggestions: false,
        gaps: false,
        reconnect: false,
      });
      setNotice("Google Calendar disconnected.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not disconnect calendar",
      );
    } finally {
      setCalendarBusy(false);
    }
  }, [setCalendarBusy, setCalendarStatus, setError, setNotice]);

  return { onDisconnectCalendar };
}
