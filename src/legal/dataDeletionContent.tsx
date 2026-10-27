import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { LEGAL_CONTACT_EMAIL } from "./contact";

/** Section strings kept here so plainText() and JSX share one source. */
export const dataDeletionSections = [
  {
    title: "Request deletion by email",
    body: `Email ${LEGAL_CONTACT_EMAIL} with subject "Sugarplum account deletion" and the account email.`,
  },
  {
    title: "What we delete",
    body: `We delete the user row, decks, study materials stored in R2 objects, cards, schedules, review logs, encrypted secrets, and sessions.`,
  },
  {
    title: "Timing",
    body: `Aim to complete the deletion within 30 days.`,
  },
  {
    title: "More information",
    body: `See /privacy for the overall privacy policy and contact details.`,
  },
] as const;

export function dataDeletionPlainText(): string {
  return dataDeletionSections.map((s) => `${s.title}\n${s.body}`).join("\n\n");
}

export function DataDeletionContent() {
  return (
    <Stack spacing={3}>
      {dataDeletionSections.map((s) => (
        <section key={s.title}>
          <Typography variant="h6" component="h2" gutterBottom>
            {s.title}
          </Typography>
          <Typography
            variant="body1"
            component="p"
            sx={{ whiteSpace: "pre-wrap" }}
          >
            {s.body}
          </Typography>
        </section>
      ))}
      <Typography variant="body2">
        <Link href="/privacy" underline="hover">
          Back to privacy policy
        </Link>
      </Typography>
    </Stack>
  );
}

