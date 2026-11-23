export const PROBLEM_TYPE_BASE = "https://sugarplum.gelbhart.dev/problems";

export function problemTypeUri(slug: string): string {
  return `${PROBLEM_TYPE_BASE}/${slug}`;
}

export function problemJsonResponse(opts: {
  status: number;
  title: string;
  detail?: string;
  code?: string;
  slug: string;
  extensions?: Record<string, unknown>;
}): Response {
  const detail = opts.detail ?? opts.title;
  return Response.json(
    {
      type: problemTypeUri(opts.slug),
      title: opts.title,
      status: opts.status,
      detail,
      ...(opts.code ? { code: opts.code } : {}),
      ...(opts.extensions ?? {}),
    },
    {
      status: opts.status,
      headers: { "Content-Type": "application/problem+json" },
    },
  );
}
