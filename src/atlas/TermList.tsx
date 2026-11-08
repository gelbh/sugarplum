import { Fragment } from "react";
import { isTaxonTerm, termLabel } from "./filter";

type Props = {
  terms: string[];
  max?: number;
  taxa?: boolean;
  capitalizeFirst?: boolean;
};

export default function TermList({
  terms,
  max = terms.length,
  taxa = true,
  capitalizeFirst = true,
}: Props) {
  if (terms.length === 0) return null;
  return (
    <>
      {terms.slice(0, max).map((term, index) => (
        <Fragment key={term}>
          {index > 0 ? ", " : null}
          {taxa && isTaxonTerm(term) ? (
            <i>{term}</i>
          ) : capitalizeFirst && index === 0 ? (
            termLabel(term)
          ) : (
            term
          )}
        </Fragment>
      ))}
      {terms.length > max ? ` +${terms.length - max}` : null}
    </>
  );
}
