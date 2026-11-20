/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import LifecycleBoard from "../../src/atlas/lifecycle/LifecycleBoard";
import {
  emptyParasiteFields,
  lifecycleStageSchema,
} from "../../worker/atlas/templates/parasite";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

function fieldsWithStages() {
  const fields = emptyParasiteFields();
  fields.lifecycleStages = [
    lifecycleStageSchema.parse({
      name: "Egg",
      infective: false,
      diagnostic: true,
    }),
    lifecycleStageSchema.parse({
      name: "L3",
      infective: true,
      diagnostic: false,
    }),
  ];
  return fields;
}

async function renderBoard(mobile: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(LifecycleBoard, {
          fields: fieldsWithStages(),
          mobile,
        }),
      ),
    );
  });
  return host;
}

describe("LifecycleBoard mobile", () => {
  it("uses a vertical stage list below md", async () => {
    const host = await renderBoard(true);
    expect(host.querySelector('[aria-label="Lifecycle stages"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Play lifecycle"]')).toBeNull();
  });

  it("keeps the swimlane play control at md+", async () => {
    const host = await renderBoard(false);
    expect(host.querySelector('[aria-label="Lifecycle stages"]')).toBeNull();
    expect(host.querySelector('[aria-label="Play lifecycle"]')).toBeTruthy();
  });
});
