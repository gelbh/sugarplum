import type { ReactNode } from "react";
import { clozeParts } from "./clozeFormat";

/** Plum mark on ivory faces: wash + weight so blanks read at a glance. */
const ANSWER_STYLE = {
  color: "#5B2C6F",
  fontWeight: 700,
  backgroundColor: "rgba(91, 44, 111, 0.18)",
  boxDecorationBreak: "clone",
  WebkitBoxDecorationBreak: "clone",
  padding: "0.05em 0.28em",
  margin: "0 -0.08em",
  borderRadius: "0.35em",
  boxShadow: "inset 0 -0.12em 0 rgba(91, 44, 111, 0.35)",
} as const;

/** Cloze back: full sentence with hidden words emphasized. */
export default function ClozeReveal({ front }: { front: string }) {
  const nodes: ReactNode[] = [];
  let blank = 0;
  for (const part of clozeParts(front)) {
    if (part.kind === "text") {
      nodes.push(part.value);
      continue;
    }
    nodes.push(
      <span key={blank} style={ANSWER_STYLE}>
        {part.answer}
      </span>,
    );
    blank += 1;
  }
  return <>{nodes}</>;
}
