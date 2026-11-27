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
  const reviewCardSrc = () =>
    readFileSync(
      resolve(process.cwd(), "src/study/faces/ReviewCard.tsx"),
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
    expect(text).toMatch(
      /fillCard\s*\?\s*\{[\s\S]*?flex:\s*1[\s\S]*?minHeight:\s*0[\s\S]*?\}\s*:\s*\{[\s\S]*?flexShrink:\s*0[\s\S]*?my:\s*["']auto["']/,
    );
    expect(text).toMatch(
      /onClaimCoverageExpanded[\s\S]*scrollTo\(\{\s*top:\s*0/,
    );
  });

  it("uses flex fill wrap when fillCard instead of unconditional shrink", () => {
    const text = pageSrc();
    expect(text).toMatch(
      /fillCard\s*\?\s*\{[\s\S]*?flex:\s*1[\s\S]*?minHeight:\s*0[\s\S]*?display:\s*["']flex["'][\s\S]*?flexDirection:\s*["']column["']/,
    );
    expect(text).not.toMatch(
      /sx=\{\{\s*width:\s*["']100%["'],\s*flexShrink:\s*0,/,
    );
  });

  it("caps unclaimed note lines with the same scroll band as claims", () => {
    const text = panelSrc();
    const unclaimed = text.match(
      /Unclaimed note lines[\s\S]*?<Stack[\s\S]*?sx=\{\{([\s\S]*?)\}\}/,
    );
    expect(unclaimed?.[1]).toMatch(/maxHeight:\s*["']min\(18vh,\s*7\.5rem\)["']/);
    expect(unclaimed?.[1]).toMatch(/overflow:\s*["']auto["']/);
  });

  it("clips the ReviewCard host when fillHeight", () => {
    const text = reviewCardSrc();
    expect(text).toMatch(
      /position:\s*["']relative["'][\s\S]*?fillHeight[\s\S]*?overflow:\s*["']hidden["']/,
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
