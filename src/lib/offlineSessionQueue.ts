import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EndSessionPayload } from './sessionApi';
import { endSession, updateSessionNotes } from './sessionApi';

const QUEUE_KEY = 'rise_offline_session_queue_v1';

/** Give up on a job the server keeps rejecting for a non-network reason. */
const MAX_ATTEMPTS = 5;
/** Hard cap so a long offline stretch cannot grow storage without bound. */
const MAX_QUEUE_LENGTH = 200;

type JobBase = {
  createdAt: string;
  /** Failed deliveries that were the server's answer, not a lost connection. */
  attempts?: number;
};

export type OfflineSessionJob =
  | ({ type: 'complete_session'; payload: EndSessionPayload } & JobBase)
  | ({
      type: 'update_session_notes';
      sessionId: string;
      note: string | null;
      nextBlock: string | null;
    } & JobBase);

function isNetworkError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('network') ||
    m.includes('fetch') ||
    m.includes('failed to fetch') ||
    m.includes('timeout') ||
    m.includes('offline') ||
    m.includes('connection')
  );
}

export function shouldQueueSessionError(message?: string): boolean {
  if (!message) return false;
  return isNetworkError(message);
}

async function readQueue(): Promise<OfflineSessionJob[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineSessionJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(jobs: OfflineSessionJob[]): Promise<void> {
  if (jobs.length === 0) {
    await AsyncStorage.removeItem(QUEUE_KEY);
    return;
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(jobs));
}

export async function enqueueOfflineSessionJob(job: OfflineSessionJob): Promise<void> {
  const queue = await readQueue();
  queue.push(job);
  // Drop the oldest entries first: recent sessions matter more than stale ones.
  await writeQueue(queue.slice(-MAX_QUEUE_LENGTH));
}

/**
 * Attach journal notes to the session that is still sitting in the outbox.
 * Writing the notes as a separate job is impossible — the row has no id yet —
 * and saving the session a second time would duplicate it in history.
 */
export async function attachNotesToQueuedSession(
  note: string | null,
  nextBlock: string | null,
): Promise<boolean> {
  const queue = await readQueue();
  for (let i = queue.length - 1; i >= 0; i--) {
    const job = queue[i];
    if (job.type !== 'complete_session') continue;
    queue[i] = {
      ...job,
      payload: { ...job.payload, note, next_block: nextBlock },
    };
    await writeQueue(queue);
    return true;
  }
  return false;
}

export async function getOfflineQueueLength(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

let flushing = false;

export async function flushOfflineSessionQueue(): Promise<{
  flushed: number;
  remaining: number;
  dropped: number;
}> {
  // AppState 'active' and the sign-in effect can both fire at once; a second
  // concurrent flush would deliver every job twice.
  if (flushing) return { flushed: 0, remaining: 0, dropped: 0 };
  flushing = true;

  try {
    const queue = await readQueue();
    if (queue.length === 0) return { flushed: 0, remaining: 0, dropped: 0 };

    const remaining: OfflineSessionJob[] = [];
    let flushed = 0;
    let dropped = 0;
    let offline = false;

    for (const job of queue) {
      // Once one call fails for a network reason, the rest will too. Keep them
      // queued instead of burning through their retry budget.
      if (offline) {
        remaining.push(job);
        continue;
      }

      const result =
        job.type === 'complete_session'
          ? await endSession(job.payload)
          : await updateSessionNotes(job.sessionId, job.note, job.nextBlock);

      if (result.ok) {
        flushed += 1;
        continue;
      }

      if (shouldQueueSessionError(result.message)) {
        offline = true;
        remaining.push(job);
        continue;
      }

      // The server answered and refused (bad payload, deleted row, RLS). Retry
      // a few times, then drop it so it stops blocking every later job.
      const attempts = (job.attempts ?? 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        dropped += 1;
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn(
            `[offlineQueue] dropping ${job.type} after ${attempts} attempts:`,
            result.message,
          );
        }
        continue;
      }
      remaining.push({ ...job, attempts });
    }

    await writeQueue(remaining);
    return { flushed, remaining: remaining.length, dropped };
  } finally {
    flushing = false;
  }
}
