import {
  PROBLEM_TYPE_BASE,
  buildProblemBody,
  problemTypeUri,
  type BuildProblemBodyOpts,
} from "../../src/api/problemWire";

export { PROBLEM_TYPE_BASE, problemTypeUri };

export function problemJsonResponse(opts: BuildProblemBodyOpts): Response {
  return Response.json(buildProblemBody(opts), {
    status: opts.status,
    headers: { "Content-Type": "application/problem+json" },
  });
}
