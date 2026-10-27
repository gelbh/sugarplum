import Button from "@mui/material/Button";
import { snapshotGuestForMerge } from "../guest/mergeOnAuth";

/** Top-level navigation to Worker Google OAuth start (iOS Home Screen friendly). */
export default function GoogleSignInButton() {
  return (
    <Button
      component="a"
      href="/api/auth/google/start"
      variant="outlined"
      fullWidth
      onClick={() => {
        // Same-tab only: open-in-new-tab skips onClick so snapshot is not taken.
        snapshotGuestForMerge();
      }}
    >
      Continue with Google
    </Button>
  );
}
