export function settingsQueryMessage(): {
  error: string | null;
  notice: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  if (params.get("linked") === "1") {
    return { error: null, notice: "Google account linked." };
  }
  if (params.get("calendar") === "1") {
    return { error: null, notice: "Google Calendar connected." };
  }
  const code = params.get("error");
  if (code === "oauth_conflict") {
    return {
      error: "That Google account is already linked to a different user.",
      notice: null,
    };
  }
  if (code === "oauth_email_mismatch") {
    return {
      error: "Google email must match your Sugarplum account email.",
      notice: null,
    };
  }
  if (code === "oauth_denied") {
    return { error: "Google linking was cancelled.", notice: null };
  }
  if (code === "oauth") {
    return { error: "Google linking failed. Try again.", notice: null };
  }
  if (code === "calendar" || code === "calendar_refresh") {
    return {
      error: "Calendar connection failed. Try again.",
      notice: null,
    };
  }
  return { error: null, notice: null };
}
