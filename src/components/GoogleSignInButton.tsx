import Button from "@mui/material/Button";
import { endGuestLocal } from "../guest/endGuestLocal";

/** Navigates to the Worker Google OAuth start endpoint. */
export default function GoogleSignInButton() {
  return (
    <Button
      type="button"
      variant="outlined"
      fullWidth
      onClick={() => {
        // Drop guest before OAuth so callback `me()` is the real account.
        endGuestLocal();
        window.location.assign("/api/auth/google/start");
      }}
    >
      Continue with Google
    </Button>
  );
}
