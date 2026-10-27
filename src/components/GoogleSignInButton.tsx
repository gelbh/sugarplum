import Button from "@mui/material/Button";
import { endGuestLocal } from "../guest/endGuestLocal";

/** Top-level navigation to Worker Google OAuth start (iOS Home Screen friendly). */
export default function GoogleSignInButton() {
  return (
    <Button
      component="a"
      href="/api/auth/google/start"
      variant="outlined"
      fullWidth
      onClick={() => {
        endGuestLocal();
      }}
    >
      Continue with Google
    </Button>
  );
}
