import type { Env } from "../env";

export type ExportQueueMessage = {
  exportId: string;
};

export async function enqueueExport(
  env: Env,
  message: ExportQueueMessage,
): Promise<void> {
  if (!env.EXPORT_QUEUE) {
    throw new Error("EXPORT_QUEUE is not configured");
  }
  await env.EXPORT_QUEUE.send(message);
}
