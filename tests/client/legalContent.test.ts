import { describe, expect, it } from "vitest";
import { LEGAL_CONTACT_EMAIL, LAST_UPDATED } from "../../src/legal/contact";
import { privacyPlainText } from "../../src/legal/privacyContent";
import { termsPlainText } from "../../src/legal/termsContent";
import { dataDeletionPlainText } from "../../src/legal/dataDeletionContent";

describe("legal content disclosures", () => {
  it("exports contact and last-updated", () => {
    expect(LEGAL_CONTACT_EMAIL).toBe("privacy@gelbhart.dev");
    expect(LAST_UPDATED).toBe("2026-10-27");
  });

  it("privacy names Google scopes, session cookie, Cloudflare, BYO LLM", () => {
    const t = privacyPlainText();
    expect(t).toMatch(/openid email profile/);
    expect(t).toMatch(/sp_session/);
    expect(t).toMatch(/Cloudflare/);
    expect(t).toMatch(/OpenAI/);
    expect(t).toMatch(/Anthropic/);
    expect(t).toMatch(/Workers AI/);
    expect(t).toMatch(/not legal advice/i);
    expect(t).toContain(LEGAL_CONTACT_EMAIL);
  });

  it("privacy discloses Google access, use, store, share, security, deletion", () => {
    const t = privacyPlainText();
    expect(t).toMatch(/verified email/i);
    expect(t).toMatch(/\bsub\b/);
    expect(t).toMatch(
      /do not store your Google display name, profile picture/i,
    );
    expect(t).toMatch(/Limited Use/i);
    expect(t).toMatch(/advertising/i);
    expect(t).toMatch(/oauth_subject/);
    expect(t).toMatch(/D1/);
    expect(t).toMatch(/HttpOnly/);
    expect(t).toMatch(/encrypted at rest/i);
    expect(t).toMatch(/\/data-deletion/);
    expect(t).toMatch(/30 days/);
  });

  it("terms cover AI disclaimer and governing law", () => {
    const t = termsPlainText();
    expect(t).toMatch(/not.*professional|medical|academic advice/i);
    expect(t).toMatch(/Israel/);
    expect(t).toMatch(/not legal advice/i);
  });

  it("data deletion is email request only", () => {
    const t = dataDeletionPlainText();
    expect(t).toContain(LEGAL_CONTACT_EMAIL);
    expect(t).toMatch(/email/i);
    expect(t).not.toMatch(/click.*delete.*button/i);
  });
});
