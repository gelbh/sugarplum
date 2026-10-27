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
    title: "Google Sign-In: what we access",
    body: `When you choose Google Sign-In we request the OAuth scopes openid email profile and call Google's OpenID userinfo endpoint. From that response we read and persist only your verified email address and your stable Google subject id (sub). We do not store your Google display name, profile picture, or other profile fields, even though the profile scope is included in the authorization request.`,
  },
  {
    title: "Google Sign-In: how we use Google user data",
    body: `We use the verified email and sub only to create or link your Sugarplum account and to keep you signed in for study features. We do not sell Google user data, use it for advertising, or use it for purposes unrelated to providing Sugarplum. Our use of Google user data complies with Google's Limited Use requirements.`,
  },
  {
    title: "Google Sign-In: how we store Google user data",
    body: `Your email and Google-linked oauth_subject (derived from sub) are stored in our Cloudflare D1 database with your account. After sign-in we establish an application session recorded in Cloudflare KV and referenced by the sp_session cookie. We do not keep Google access tokens for ongoing API calls after the sign-in exchange completes.`,
  },
  {
    title: "How we use other account and study data",
    body: `We use account and study data to authenticate you, store and schedule your cards, run generation jobs (rules harvest plus Workers AI or your BYO provider), and operate the service.`,
  },
  {
    title: "Sharing and processors",
    body: `Infrastructure runs on Cloudflare (Workers, D1, R2, KV, Queues, Workers AI). Google provides OAuth for Sign-In; we do not transfer your Google Sign-In profile fields (email and sub) to unrelated third parties for advertising or resale. If you save a BYO OpenAI, Anthropic, or Google API key, study material text and prompts are sent to that provider to generate drafts (that is study content you supply, not your Google Sign-In profile data). We do not run a third-party product analytics SDK today.`,
  },
  {
    title: "Security",
    body: `Traffic to Sugarplum is served over HTTPS. The sp_session cookie is HttpOnly and SameSite=Lax (Secure on HTTPS). Optional BYO LLM API keys are encrypted at rest before storage. Access to account data is gated by your authenticated session.`,
  },
  {
    title: "Cookies and local storage",
    body: `sp_session is an HttpOnly SameSite=Lax cookie (Secure on HTTPS) used for login sessions (about 30 days). Theme and due-cache live in localStorage on your device. We do not set third-party advertising cookies.`,
  },
  {
    title: "Retention and deletion",
    body: `Account and study data, including Google-linked email and oauth_subject, are kept until you ask us to delete them or the account is closed. Session records expire with the cookie/KV TTL (about 30 days). Email ${LEGAL_CONTACT_EMAIL} to access, correct, or delete your account data. See /data-deletion for the request process. We aim to respond within 30 days. When we process a deletion request we remove your account record, decks, materials, cards, schedules, sessions, and stored secrets.`,
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
