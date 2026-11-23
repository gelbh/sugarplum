/** SoT for public/problems/<slug>.html content. */
export const PROBLEM_TYPE_BASE = "https://sugarplum.gelbhart.dev/problems";

/** @typedef {{
 *   slug: string,
 *   lede: string,
 *   statusHtml: string,
 *   extensionsHtml: string,
 *   remediation: string,
 * }} ProblemDoc */

/** @type {ProblemDoc[]} */
export const PROBLEM_DOCS = [
  {
    slug: "view-as-read-only",
    lede: "Read-only while viewing as another user.",
    statusHtml: '<span class="status">403</span>',
    extensionsHtml:
      "<code>code</code> = <code>VIEW_AS_READ_ONLY</code>",
    remediation:
      "Mutating API calls (except exit impersonation and logout) are rejected while viewing as another user. Exit view-as to mutate.",
  },
  {
    slug: "http-exception",
    lede: 'Generic Worker error for a bare <code>HTTPException</code>.',
    statusHtml:
      'Status from the thrown exception (for example <span class="status">400</span>, <span class="status">401</span>, <span class="status">404</span>, <span class="status">503</span>).',
    extensionsHtml:
      "None required. <code>detail</code> / <code>title</code> carry the message.",
    remediation:
      "Read <code>detail</code> for the occurrence. Fix the request or auth state and retry.",
  },
  {
    slug: "internal-server-error",
    lede: "Unexpected Worker failure outside an HTTPException.",
    statusHtml: '<span class="status">500</span>',
    extensionsHtml: "None required.",
    remediation:
      "Treat as a transient server fault. Retry later, or report if it persists.",
  },
  {
    slug: "export-business",
    lede: "Anki export could not complete as a business failure.",
    statusHtml: '<span class="status">400</span>',
    extensionsHtml:
      "<code>warnings</code> = <code>{ missingMedia: number, skippedCards: number }</code>",
    remediation:
      "Fix deck or selection contents (for example no owned decks, or no exportable cards) and retry. Occurrence text is in <code>detail</code>.",
  },
];
