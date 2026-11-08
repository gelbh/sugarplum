import { Fragment } from "react";
import { isTaxonTerm, termLabel } from "./filter";

/** Vocab terms in a sentence: taxa in italics, the first plain term capitalised, then "+N". */
export default function TermList({
  terms,
  max = terms.length,
}: {
  terms: string[];
  max?: number;
}) {
  if (terms.length === 0) return null;
  return (
    <>
      {terms.slice(0, max).map((t, i) => (
        <Fragment key={t}>
          {i > 0 ? ", " : null}
          {isTaxonTerm(t) ? <i>{t}</i> : i === 0 ? termLabel(t) : t}
        </Fragment>
      ))}
      {terms.length > max ? ` +${terms.length - max}` : null}
    </>
  );
}
