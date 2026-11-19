/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShellSidebarEdgeBar from "../../src/app/shell/ShellSidebarEdgeBar";
import {
  DRAWER_WIDTH,
  RAIL_WIDTH,
} from "../../src/app/shell/chromeTokens";

async function renderBar(props: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onDragWidth: (width: number | null) => void;
}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(ShellSidebarEdgeBar, {
          sideWidth: props.collapsed ? RAIL_WIDTH : DRAWER_WIDTH,
          collapsed: props.collapsed,
          onCollapsedChange: props.onCollapsedChange,
          onDragWidth: props.onDragWidth,
        }),
      ),
    );
  });
  return { host, root };
}

describe("ShellSidebarEdgeBar", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("toggles collapse from the centered control", async () => {
    const onCollapsedChange = vi.fn();
    const { host } = await renderBar({
      collapsed: false,
      onCollapsedChange,
      onDragWidth: vi.fn(),
    });
    const toggle = [...host.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Collapse sidebar",
    );
    expect(toggle).toBeTruthy();
    await act(async () => {
      toggle!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it("drags the bar to update width", async () => {
    const onDragWidth = vi.fn();
    const onCollapsedChange = vi.fn();
    const { host } = await renderBar({
      collapsed: false,
      onCollapsedChange,
      onDragWidth,
    });
    const bar = host.querySelector('[role="separator"]') as HTMLElement;
    expect(bar).toBeTruthy();
    Object.defineProperty(bar, "setPointerCapture", {
      value: vi.fn(),
      configurable: true,
    });
    function pointer(type: string, clientX: number) {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(ev, { pointerId: 1, button: 0, clientX });
      return ev;
    }
    await act(async () => {
      bar.dispatchEvent(pointer("pointerdown", 160));
    });
    expect(onDragWidth).toHaveBeenCalled();
    await act(async () => {
      bar.dispatchEvent(pointer("pointerup", 90));
    });
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    expect(onDragWidth).toHaveBeenCalledWith(null);
  });
});
