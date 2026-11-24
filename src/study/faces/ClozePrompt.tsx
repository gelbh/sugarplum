import type { ReactNode } from "react";
import { clozeParts } from "./clozeFormat";

const BLANK_STYLE = {
  display: "inline-block",
  width: "4.5em",
  borderBottom: "1px solid currentColor",
  lineHeight: 1,
  verticalAlign: "baseline",
  position: "relative",
} as const;

const BLANK_LABEL_STYLE = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

export default function ClozePrompt({ front }: { front: string }) {
  const nodes: ReactNode[] = [];
  let blank = 0;
  for (const part of clozeParts(front)) {
    if (part.kind === "text") {
      nodes.push(part.value);
      continue;
    }
    if (part.hint?.trim()) {
      nodes.push(part.hint);
      blank += 1;
      continue;
    }
    nodes.push(
      <span key={blank} style={BLANK_STYLE}>
        <span style={BLANK_LABEL_STYLE}>blank</span>
      </span>,
    );
    blank += 1;
  }
  return <>{nodes}</>;
}
