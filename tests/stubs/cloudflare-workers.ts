/** Vitest stub for `cloudflare:workers` (WorkflowEntrypoint + DurableObject). */
export abstract class DurableObject<Env = unknown, Props = {}> {
  protected ctx: DurableObjectState;
  protected env: Env;
  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}

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
    configOrCallback:
      | (() => Promise<T>)
      | {
          retries?: {
            limit: number;
            delay: string | number;
            backoff?: string;
          };
        },
    callback?: () => Promise<T>,
  ) => Promise<T>;
  sleep: (name: string, duration: string | number) => Promise<void>;
};
