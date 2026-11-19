import Typography from "@mui/material/Typography";
import { LEGAL_CONTACT_EMAIL } from "./contact";
import { LegalSections } from "./LegalSections";

/** Section strings kept here so plainText() and JSX share one source. */
export const termsSections = [
  {
    title: "Acceptance",
    body: `By using Sugarplum, you agree to these terms. If you do not agree, do not use the service.`,
  },
  {
    title: "Service description (SRS and AI drafts)",
    body: `Sugarplum provides spaced-repetition study support (SRS) and may generate AI drafts for your study materials. These drafts are not professional advice, not medical advice, and not academic advice.`,
  },
  {
    title: "Accounts and acceptable use",
    body: `You are responsible for your account and for using the service lawfully. Do not upload or input prohibited or unlawful content.`,
  },
  {
    title: "AI-generated content disclaimer",
    body: `AI-generated text may be inaccurate or incomplete. You should verify information before using it. Nothing in Sugarplum is professional, medical, or academic advice.`,
  },
  {
    title: "BYO API keys",
    body: `If you add your own OpenAI, Anthropic, or Google API key, Sugarplum sends material text and prompts to that provider to generate drafts. Keys are stored encrypted for your account.`,
  },
  {
    title: "Intellectual property",
    body: `You retain ownership of your study content. Sugarplum provides the service, and we may retain necessary copies to run and maintain it.`,
  },
  {
    title: "Availability and disclaimers",
    body: `The service is provided as-is. We disclaim warranties to the maximum extent permitted by law. To the maximum extent permitted by law, we limit liability for indirect or consequential damages.`,
  },
  {
    title: "Termination",
    body: `We may suspend or terminate access if we reasonably believe your use violates these terms or applicable law.`,
  },
  {
    title: "Changes, contact, and governing law",
    body: `We may change these terms. Governing law is the State of Israel. This page is not legal advice. Contact: ${LEGAL_CONTACT_EMAIL}.`,
  },
] as const;

export function termsPlainText(): string {
  return termsSections.map((s) => `${s.title}\n${s.body}`).join("\n\n");
}

export function TermsContent() {
  return (
    <LegalSections
      sections={termsSections}
      footer={
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          This page is operator-written and is not legal advice.
        </Typography>
      }
    />
  );
}
