import type { DetectionResult } from '../engine/detect';
import type { DateFormat } from '../engine/parse';

type Reply = { id: number; result?: DetectionResult; error?: string };
type Pending = { resolve: (value: DetectionResult) => void; reject: (reason: Error) => void };

const worker = new Worker(new URL('../engine/import.worker.ts', import.meta.url), { type: 'module' });
const pending = new Map<number, Pending>();
let nextId = 0;

worker.onmessage = (event: MessageEvent<Reply>) => {
  const task = pending.get(event.data.id);
  if (!task) return;
  pending.delete(event.data.id);
  if (event.data.error) task.reject(new Error(event.data.error));
  else if (event.data.result) task.resolve(event.data.result);
  else task.reject(new Error('This statement could not be read.'));
};

function send(message: { type: 'files'; files: Array<{ name: string; bytes: ArrayBuffer }> } | { type: 'dateFormat'; format: DateFormat }, transfer: Transferable[] = []): Promise<DetectionResult> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...message }, transfer);
  });
}

/** File contents are transferred directly to the on-device parsing worker. */
export async function importStatement(files: File[]): Promise<DetectionResult> {
  const bytes = await Promise.all(files.map((file) => file.arrayBuffer()));
  return send({ type: 'files', files: files.map((file, index) => ({ name: file.name, bytes: bytes[index]! })) }, bytes);
}

export function resolveStatementDates(format: DateFormat): Promise<DetectionResult> {
  return send({ type: 'dateFormat', format });
}

/** Forget every statement file held by the parsing worker (new audit / delete everything). */
export function resetStatements(): void {
  worker.postMessage({ id: ++nextId, type: 'reset' });
}
