import { Fragment, type ReactNode } from "react";
import { isTaxonTerm, termLabel } from "./filter";

/** Comma list of vocab terms: taxa in italics (when `taxa`), first word capitalised, `+N` past `max`. */
export function termList(
  terms: string[],
  { max = Infinity, taxa = true }: { max?: number; taxa?: boolean } = {},
): ReactNode {
  if (terms.length === 0) return null;
  return (
    <>
      {terms.slice(0, max).map((t, i) => (
        <Fragment key={t}>
          {i > 0 ? ", " : null}
          {taxa && isTaxonTerm(t) ? <i>{t}</i> : i === 0 ? termLabel(t) : t}
        </Fragment>
      ))}
      {terms.length > max ? ` +${terms.length - max}` : null}
    </>
  );
}
