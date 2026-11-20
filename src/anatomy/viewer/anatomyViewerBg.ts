import type { AnatomyCanvasBackground } from "./AnatomyCanvas";

export type BgChoiceId = "page" | "paper" | "studio" | "white" | "stage";

export type BgChoice = {
  id: BgChoiceId;
  label: string;
  swatch: string | "checker";
  value: AnatomyCanvasBackground;
};

export function anatomyViewerBgChoices(paperColor: string): BgChoice[] {
  return [
    {
      id: "page",
      label: "Page",
      swatch: "checker",
      value: null,
    },
    {
      id: "paper",
      label: "Paper",
      swatch: paperColor,
      value: paperColor,
    },
    {
      id: "studio",
      label: "Studio",
      swatch: "#d8d2cc",
      value: "#d8d2cc",
    },
    {
      id: "white",
      label: "White",
      swatch: "#ffffff",
      value: "#ffffff",
    },
    {
      id: "stage",
      label: "Stage",
      swatch: "#1e0d1b",
      value: "#1e0d1b",
    },
  ];
}
