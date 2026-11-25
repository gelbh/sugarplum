import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "src/deckHub");

const expected = [
  "hub/MissionBoard.tsx",
  "hub/DeckHubHubView.tsx",
  "workshop/workshopStack.ts",
  "workshop/EmptyNext.tsx",
  "page/DeckHubWorkshopView.tsx",
  "cards/CardsWorkshop.tsx",
  "materials/MaterialsWorkshop.tsx",
  "create/AddMaterialWorkshop.tsx",
  "create/hubDiyCreate.ts",
  "hygiene/hygieneRegenAll.ts",
  "cover/CoverPickerDialog.tsx",
  "cover/layoutOnnx.ts",
  "diy/occlusionLayout.ts",
  "diy/DiyCardPreview.tsx",
  "dialogs/DeckHubDialogs.tsx",
  "dialogs/deckHubDialogSx.ts",
  "page/useDeckHubLoad.ts",
  "index.ts",
  "kernel.ts",
  "motion.ts",
  "deckHubMotion.css",
];

const mustNotExistAtRoot = [
  "MissionBoard.tsx",
  "workshopStack.ts",
  "CardsWorkshop.tsx",
  "MaterialsWorkshop.tsx",
  "AddMaterialWorkshop.tsx",
  "hygieneRegenAll.ts",
  "CoverPickerDialog.tsx",
  "occlusionLayout.ts",
  "DiyCardPreview.tsx",
  "DeckHubDialogs.tsx",
  "useDeckHubLoad.ts",
];

const rootKeepers = new Set([
  "index.ts",
  "kernel.ts",
  "motion.ts",
  "deckHubMotion.css",
]);

const rootFolders = new Set([
  "hub",
  "workshop",
  "cards",
  "materials",
  "create",
  "hygiene",
  "cover",
  "diy",
  "dialogs",
  "page",
]);

describe("src/deckHub subdomain layout", () => {
  it("keeps leaves under locked subdomain folders", () => {
    for (const rel of expected) {
      expect(existsSync(resolve(root, rel)), rel).toBe(true);
    }
    for (const rel of mustNotExistAtRoot) {
      expect(existsSync(resolve(root, rel)), rel).toBe(false);
    }
  });

  it("root holds only keepers plus subdomain folders", () => {
    const names = readdirSync(root).filter((name) => !name.startsWith("."));
    for (const name of names) {
      if (rootKeepers.has(name) || rootFolders.has(name)) continue;
      expect.fail(`unexpected root entry: ${name}`);
    }
    for (const name of rootKeepers) {
      expect(names.includes(name), name).toBe(true);
    }
    for (const name of rootFolders) {
      expect(names.includes(name), name).toBe(true);
    }
  });
});
