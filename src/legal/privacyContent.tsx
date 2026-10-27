import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { LEGAL_CONTACT_EMAIL, APP_ORIGIN } from "./contact";

/** Section strings kept here so plainText() and JSX share one source. */
export const privacySections = [
  {
    title: "Who we are",
    body: `Sugarplum is a spaced-repetition study app operated at ${APP_ORIGIN}. Contact: ${LEGAL_CONTACT_EMAIL}.`,
  },
  {
    title: "What we collect",
    body: `Account email; password hash (email signup) or Google account subject id (sub) plus verified email (Google Sign-In); study materials you upload or paste; generated flashcard drafts and accepted cards; review history; optional BYO LLM API keys (encrypted at rest); session cookie sp_session; localStorage keys for theme (sugarplum-mode) and study due-cache.`,
  },
  {
    title: "Google Sign-In",
    body: `When you use Google Sign-In we request scopes openid email profile. We read your verified email and stable Google subject id (sub) to create or link your Sugarplum account. We do not sell Google user data or use it for advertising. Our use of Google user data complies with Google’s Limited Use requirements.`,
  },
  {
    title: "How we use data",
    body: `We use this data to authenticate you, store and schedule your cards, run generation jobs (rules harvest plus Workers AI or your BYO provider), and operate the service.`,
  },
  {
    title: "Sharing and processors",
    body: `Infrastructure runs on Cloudflare (Workers, D1, R2, KV, Queues, Workers AI). Google provides OAuth. If you save a BYO OpenAI, Anthropic, or Google API key, material text and prompts are sent to that provider to generate drafts. We do not run a third-party product analytics SDK today.`,
  },
  {
    title: "Cookies and local storage",
    body: `sp_session is an HttpOnly SameSite=Lax cookie (Secure on HTTPS) used for login sessions (about 30 days). Theme and due-cache live in localStorage on your device. We do not set third-party advertising cookies.`,
  },
  {
    title: "Retention",
    body: `Account and study data are kept until you ask us to delete them or the account is closed. Session records expire with the cookie/KV TTL.`,
  },
  {
    title: "Your rights and deletion",
    body: `Email ${LEGAL_CONTACT_EMAIL} to access, correct, or delete your account data. See /data-deletion for the request process. We aim to respond within 30 days.`,
  },
  {
    title: "Children",
    body: `Sugarplum is not directed at children under 13. If you believe a child provided data, contact us to remove it.`,
  },
  {
    title: "Changes and contact",
    body: `We may update this policy; the Last updated date at the top will change. This page is operator-written and is not legal advice. Contact: ${LEGAL_CONTACT_EMAIL}.`,
  },
] as const;

export function privacyPlainText(): string {
  return privacySections.map((s) => `${s.title}\n${s.body}`).join("\n\n");
}

export function PrivacyContent() {
  return (
    <Stack spacing={3}>
      {privacySections.map((s) => (
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
        <Link href="/data-deletion" underline="hover">
          How to request data deletion
        </Link>
      </Typography>
    </Stack>
  );
}

