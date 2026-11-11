/** Vitest stub for `cloudflare:workers` (WorkflowEntrypoint only). */
export abstract class WorkflowEntrypoint<
  Env = unknown,
  T = unknown,
> {
  protected ctx: ExecutionContext;
  protected env: Env;
  constructor(ctx: ExecutionContext, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
  abstract run(
    event: { payload: T; timestamp: Date; instanceId: string },
    step: unknown,
  ): Promise<unknown>;
}

export type WorkflowEvent<T> = {
  payload: Readonly<T>;
  timestamp: Date;
  instanceId: string;
};

export type WorkflowStep = {
  do: <T>(
    name: string,
    callback: () => Promise<T>,
    config?: {
      retries?: {
        limit: number;
        delay: string | number;
        backoff?: string;
      };
    },
  ) => Promise<T>;
};
