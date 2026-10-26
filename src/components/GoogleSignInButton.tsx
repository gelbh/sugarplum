import Button from "@mui/material/Button";

/** Navigates to the Worker Google OAuth start endpoint. */
export default function GoogleSignInButton() {
  return (
    <Button
      type="button"
      variant="outlined"
      fullWidth
      onClick={() => {
        window.location.assign("/api/auth/google/start");
      }}
    >
      Continue with Google
    </Button>
  );
}
