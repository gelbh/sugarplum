import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("DraftReviewPage mobile layout contract", () => {
  const pageSrc = () =>
    readFileSync(
      resolve(process.cwd(), "src/routes/DraftReviewPage.tsx"),
      "utf8",
    );
  const panelSrc = () =>
    readFileSync(
      resolve(process.cwd(), "src/draftReview/ClaimCoveragePanel.tsx"),
      "utf8",
    );
  const shellSrc = () =>
    readFileSync(resolve(process.cwd(), "src/app/AppShell.tsx"), "utf8");

  it("gates fillHeight on md-up media query", () => {
    const text = pageSrc();
    expect(text).toMatch(/useMediaQuery/);
    expect(text).toMatch(/breakpoints\.up\(\s*["']md["']\s*\)/);
    expect(text).toMatch(/fillHeight=\{fillCard\}/);
  });

  it("releases the ready card column clip below md", () => {
    const text = pageSrc();
    expect(text).toMatch(/fillCard\s*\?\s*["']hidden["']\s*:\s*["']visible["']/);
    expect(text).toMatch(/fillCard\s*\?\s*1\s*:\s*["']none["']/);
  });

  it("collapses claim coverage and centers short content below md", () => {
    const text = pageSrc();
    expect(text).toMatch(/defaultCollapsed=\{!fillCard\}/);
    expect(text).toMatch(/onExpandedChange=\{onClaimCoverageExpanded\}/);
    expect(text).toMatch(/my:\s*fillCard\s*\?\s*0\s*:\s*["']auto["']/);
    expect(text).toMatch(
      /onClaimCoverageExpanded[\s\S]*scrollTo\(\{\s*top:\s*0/,
    );
  });

  it("supports claim coverage expand toggle and Fill-all auto-expand", () => {
    const text = panelSrc();
    expect(text).toMatch(/defaultCollapsed/);
    expect(text).toMatch(/onExpandedChange/);
    expect(text).toMatch(/aria-expanded=\{expanded\}/);
    expect(text).toMatch(/fillAllBusy/);
    expect(text).toMatch(/onExpandedChange\?\.\(true\)/);
  });

  it("suppresses shell gen strip on draft review routes", () => {
    const text = shellSrc();
    expect(text).toMatch(/onDraftReview/);
    expect(text).toMatch(/stripGenStatus = onDraftReview \? null : genStatus/);
    expect(text).toMatch(/\/jobs\\\/\[\^\/\]\+\\\/drafts/);
  });
});
