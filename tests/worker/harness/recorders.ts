import type { Bindings } from "./types";

type WorkflowBinding = NonNullable<Env["GENERATION_WORKFLOW"]>;
type WorkflowInstanceRow = { status: string; output?: unknown; params?: unknown };

const generateQueueMessages: unknown[] = [];
const cardRegenQueueMessages: unknown[] = [];
const exportQueueMessages: unknown[] = [];
const workflowCreates: unknown[] = [];
const workflowTerminates: string[] = [];
const workflowInstances = new Map<string, WorkflowInstanceRow>();
function wrapQueue(
  queue: Queue | undefined,
  sink: unknown[],
): Queue | undefined {
  if (!queue) return undefined;
  return {
    send: async (body: unknown, options?: QueueSendOptions) => {
      sink.push(body);
      return queue.send(body, options);
    },
    sendBatch: async (messages: Iterable<MessageSendRequest>, options?: QueueSendBatchOptions) => {
      for (const m of messages) sink.push(m.body);
      return queue.sendBatch(messages, options);
    },
  } as Queue;
}

/** Wrap env queue producers so getQueueMessages* can observe sends. */
export function installQueueRecorders(env: Bindings): Bindings {
  return {
    ...env,
    GENERATE_QUEUE: wrapQueue(env.GENERATE_QUEUE, generateQueueMessages),
    CARD_REGEN_QUEUE: wrapQueue(env.CARD_REGEN_QUEUE, cardRegenQueueMessages),
    EXPORT_QUEUE: wrapQueue(env.EXPORT_QUEUE, exportQueueMessages),
  };
}

export function getQueueMessages(): unknown[] {
  return [...generateQueueMessages];
}

export function getCardRegenQueueMessages(): unknown[] {
  return [...cardRegenQueueMessages];
}

export function getExportQueueMessages(): unknown[] {
  return [...exportQueueMessages];
}

export function clearQueueMessages(): void {
  generateQueueMessages.length = 0;
  cardRegenQueueMessages.length = 0;
  exportQueueMessages.length = 0;
}

function wrapWorkflow(binding: WorkflowBinding | undefined): WorkflowBinding | undefined {
  if (!binding) return undefined;
  return {
    create: async (options?: { id?: string; params?: unknown }) => {
      const id = options?.id ?? crypto.randomUUID();
      if (workflowInstances.has(id)) {
        throw new Error(`Workflow instance already exists: ${id}`);
      }
      workflowCreates.push(options ?? { id });
      workflowInstances.set(id, {
        status: "running",
        params: options?.params,
      });
      return {
        id,
        status: async () => ({
          status: workflowInstances.get(id)?.status ?? "unknown",
          output: workflowInstances.get(id)?.output,
        }),
        terminate: async () => {
          workflowTerminates.push(id);
          const row = workflowInstances.get(id);
          if (row) row.status = "terminated";
        },
        delete: async () => {
          workflowInstances.delete(id);
        },
      };
    },
    get: async (id: string) => {
      const row = workflowInstances.get(id);
      if (!row) throw new Error(`Workflow instance not found: ${id}`);
      return {
        id,
        status: async () => ({ status: row.status, output: row.output }),
        terminate: async () => {
          workflowTerminates.push(id);
          row.status = "terminated";
        },
        delete: async () => {
          workflowInstances.delete(id);
        },
      };
    },
  } as WorkflowBinding;
}

/** Wrap workflow bindings so getWorkflowCreates* can observe create/terminate. */
export function installWorkflowRecorders(env: Bindings): Bindings {
  return {
    ...env,
    GENERATION_WORKFLOW: wrapWorkflow(env.GENERATION_WORKFLOW),
    FILL_ALL_WORKFLOW: wrapWorkflow(env.FILL_ALL_WORKFLOW),
  };
}

export function getWorkflowCreates(): unknown[] {
  return [...workflowCreates];
}

export function getWorkflowTerminates(): string[] {
  return [...workflowTerminates];
}

export function setWorkflowInstance(
  id: string,
  patch: { status?: string; output?: unknown },
): void {
  const row = workflowInstances.get(id) ?? { status: "running" };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.output !== undefined) row.output = patch.output;
  workflowInstances.set(id, row);
}

export function clearWorkflowMessages(): void {
  workflowCreates.length = 0;
  workflowTerminates.length = 0;
  workflowInstances.clear();
}

let adminOverviewPrepareCount = 0;
const progressWrites: string[] = [];

export function clearAdminOverviewPrepareCount(): void {
  adminOverviewPrepareCount = 0;
}

export function getAdminOverviewPrepareCount(): number {
  return adminOverviewPrepareCount;
}

/** Count prepares whose SQL includes the admin-overview marker comment. */
export function installAdminOverviewPrepareCounter(env: Bindings): Bindings {
  const db = env.DB;
  return {
    ...env,
    DB: new Proxy(db, {
      get(target, prop, _receiver) {
        if (prop === "prepare") {
          return (query: string) => {
            if (query.includes("sugarplum:admin-overview")) {
              adminOverviewPrepareCount += 1;
            }
            return target.prepare(query);
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value;
      },
    }),
  };
}

export function clearProgressWrites(): void {
  progressWrites.length = 0;
}

export function getProgressWrites(): string[] {
  return [...progressWrites];
}

/** Record achievement_progress UPSERT targets (evaluate write-discipline tests). */
export function installProgressWriteRecorder(env: Bindings): Bindings {
  const db = env.DB;
  return {
    ...env,
    DB: new Proxy(db, {
      get(target, prop, _receiver) {
        if (prop === "prepare") {
          return (query: string) => {
            const stmt = target.prepare(query);
            if (query.includes("INSERT INTO achievement_progress")) {
              const originalBind = stmt.bind.bind(stmt);
              (stmt as { bind: typeof stmt.bind }).bind = (
                ...args: unknown[]
              ) => {
                // UPSERT_PROGRESS binds: user_id, achievement_id, current_value, threshold
                if (typeof args[1] === "string") progressWrites.push(args[1]);
                return originalBind(
                  ...(args as Parameters<typeof stmt.bind>),
                );
              };
            }
            return stmt;
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value;
      },
    }),
  };
}
