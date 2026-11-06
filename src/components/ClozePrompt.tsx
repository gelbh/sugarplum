import type { ReactNode } from "react";
import { ANKI_CLOZE_RE } from "../lib/clozeFormat";

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
  const re = new RegExp(ANKI_CLOZE_RE.source, "g");
  let cursor = 0;
  let blank = 0;
  for (const match of front.matchAll(re)) {
    const index = match.index ?? cursor;
    if (index > cursor) nodes.push(front.slice(cursor, index));
    const hint = match[2];
    if (hint !== undefined && hint.length > 0) {
      nodes.push(hint);
    } else {
      nodes.push(
        <span key={blank} style={BLANK_STYLE}>
          <span style={BLANK_LABEL_STYLE}>blank</span>
        </span>,
      );
      blank += 1;
    }
    cursor = index + match[0].length;
  }
  if (cursor < front.length) nodes.push(front.slice(cursor));
  return <>{nodes}</>;
}
