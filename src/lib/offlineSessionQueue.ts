import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EndSessionPayload } from './sessionApi';
import { endSession, updateSessionNotes } from './sessionApi';

const QUEUE_KEY = 'rise_offline_session_queue_v1';

export type OfflineSessionJob =
  | { type: 'complete_session'; payload: EndSessionPayload; createdAt: string }
  | {
      type: 'update_session_notes';
      sessionId: string;
      note: string | null;
      nextBlock: string | null;
      createdAt: string;
    };

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
  await writeQueue(queue);
}

export async function getOfflineQueueLength(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function flushOfflineSessionQueue(): Promise<{
  flushed: number;
  remaining: number;
}> {
  const queue = await readQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  const remaining: OfflineSessionJob[] = [];
  let flushed = 0;

  for (const job of queue) {
    if (job.type === 'complete_session') {
      const result = await endSession(job.payload);
      if (result.ok) {
        flushed += 1;
        continue;
      }
      if (shouldQueueSessionError(result.message)) {
        remaining.push(job);
        continue;
      }
      remaining.push(job);
    } else {
      const result = await updateSessionNotes(job.sessionId, job.note, job.nextBlock);
      if (result.ok) {
        flushed += 1;
        continue;
      }
      if (shouldQueueSessionError(result.message)) {
        remaining.push(job);
        continue;
      }
      remaining.push(job);
    }
  }

  await writeQueue(remaining);
  return { flushed, remaining: remaining.length };
}
