import { describe, expect, it } from "vitest";
import {
  atMostOneDiagnostic,
  diagnosticMirrorForSave,
  diagnosticOwnershipIssue,
  diagnosticStageFromStages,
  hydrateLifecycleDraft,
  syncDiagnosticOwnership,
} from "../../../worker/atlas/lifecycleDiagnostic";

const stages = (
  rows: { name: string; diagnostic?: boolean }[],
) => rows.map((r) => ({ name: r.name, diagnostic: r.diagnostic ?? false }));

describe("lifecycleDiagnostic", () => {
  it("derives the mirror from a single flag", () => {
    const s = stages([
      { name: "egg", diagnostic: true },
      { name: "adult" },
    ]);
    expect(diagnosticStageFromStages(s)).toBe("egg");
    expect(atMostOneDiagnostic(s)).toBe(true);
  });

  it("rejects more than one diagnostic flag", () => {
    const s = stages([
      { name: "egg", diagnostic: true },
      { name: "adult", diagnostic: true },
    ]);
    expect(atMostOneDiagnostic(s)).toBe(false);
    expect(diagnosticOwnershipIssue(s, null)).toBe(
      "at most one diagnostic stage",
    );
  });

  it("rejects flag vs mirror name conflicts", () => {
    const s = stages([{ name: "egg", diagnostic: true }]);
    expect(diagnosticOwnershipIssue(s, "adult")).toBe(
      "diagnosticStage conflicts with stage.diagnostic",
    );
  });

  it("hydrates a flag from the legacy mirror string", () => {
    const s = stages([{ name: "egg" }, { name: "adult" }]);
    const synced = syncDiagnosticOwnership(s, "Egg");
    expect(synced.stages[0].diagnostic).toBe(true);
    expect(synced.diagnosticStage).toBe("egg");
    expect(hydrateLifecycleDraft(s, "egg")[0].diagnostic).toBe(true);
  });

  it("leaves an orphan mirror without inventing a flag", () => {
    const s = stages([{ name: "miracidium" }]);
    const synced = syncDiagnosticOwnership(s, "egg");
    expect(synced.stages.every((x) => !x.diagnostic)).toBe(true);
    expect(synced.diagnosticStage).toBe("egg");
    expect(diagnosticOwnershipIssue(s, "egg")).toBeNull();
  });
});

describe("diagnosticMirrorForSave", () => {
  it("preserves an orphan prior mirror when no flags", () => {
    const s = stages([{ name: "larvated egg" }]);
    expect(diagnosticMirrorForSave(s, "egg")).toBe("egg");
  });

  it("clears the mirror when the prior name matches a stage and flags are off", () => {
    const s = stages([{ name: "egg" }]);
    expect(diagnosticMirrorForSave(s, "egg")).toBeNull();
  });
});
