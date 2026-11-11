/** Params for GenerationWorkflow create + step callbacks. */
export type GenerationWorkflowParams = {
  jobId: string;
  materialId: string;
  deckId: string;
  autoFollowup?: boolean;
};
