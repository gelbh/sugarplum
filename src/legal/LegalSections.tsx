import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { LEGAL_CONTACT_EMAIL } from "./contact";

const LEGAL_PATHS = ["/data-deletion", "/privacy", "/terms"] as const;

type LegalSection = {
  title: string;
  body: string;
};

/** Turn email + known legal paths into links; keep plainText bodies unchanged. */
export function linkifyLegalBody(text: string): ReactNode[] {
  const pattern = new RegExp(
    `(${LEGAL_CONTACT_EMAIL.replace(".", "\\.")}|${LEGAL_PATHS.join("|")})`,
    "g",
  );
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token === LEGAL_CONTACT_EMAIL) {
      parts.push(
        <Link
          key={`m-${key++}`}
          href={`mailto:${LEGAL_CONTACT_EMAIL}`}
          underline="hover"
          color="primary"
        >
          {LEGAL_CONTACT_EMAIL}
        </Link>,
      );
    } else {
      parts.push(
        <Link key={`p-${key++}`} href={token} underline="hover" color="primary">
          {token}
        </Link>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function LegalSections({
  sections,
  footer,
}: {
  sections: readonly LegalSection[];
  footer?: ReactNode;
}) {
  return (
    <Stack spacing={0}>
      {sections.map((s, i) => (
        <Box
          key={s.title}
          component="section"
          sx={{
            py: 2.5,
            borderTop: i === 0 ? 0 : 1,
            borderColor: "divider",
          }}
        >
          <Typography
            variant="subtitle1"
            component="h2"
            sx={{ fontWeight: 600, mb: 1, color: "primary.main" }}
          >
            {s.title}
          </Typography>
          <Typography
            variant="body1"
            component="p"
            sx={{
              color: "text.secondary",
              whiteSpace: "pre-wrap",
              maxWidth: "68ch",
              lineHeight: 1.65
            }}>
            {linkifyLegalBody(s.body)}
          </Typography>
        </Box>
      ))}
      {footer ? (
        <Box sx={{ pt: 2, borderTop: 1, borderColor: "divider" }}>{footer}</Box>
      ) : null}
    </Stack>
  );
}
