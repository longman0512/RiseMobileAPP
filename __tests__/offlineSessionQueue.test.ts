import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  enqueueOfflineSessionJob,
  flushOfflineSessionQueue,
  getOfflineQueueLength,
  shouldQueueSessionError,
} from '../src/lib/offlineSessionQueue';
import { endSession, updateSessionNotes } from '../src/lib/sessionApi';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    __reset: () => {
      store = {};
    },
  };
});

jest.mock('../src/lib/sessionApi', () => ({
  endSession: jest.fn(),
  updateSessionNotes: jest.fn(),
}));

const mockEndSession = endSession as jest.MockedFunction<typeof endSession>;
const mockUpdateNotes = updateSessionNotes as jest.MockedFunction<typeof updateSessionNotes>;

function completeJob(startedAt: string) {
  return {
    type: 'complete_session' as const,
    payload: {
      coin_type: 'lockin' as const,
      started_at: startedAt,
      duration_mins: 50,
      note: null,
      next_block: null,
    },
    createdAt: startedAt,
  };
}

beforeEach(async () => {
  (AsyncStorage as unknown as { __reset: () => void }).__reset();
  jest.clearAllMocks();
});

describe('shouldQueueSessionError', () => {
  it('queues transport failures and nothing else', () => {
    expect(shouldQueueSessionError('Network request failed')).toBe(true);
    expect(shouldQueueSessionError('fetch failed')).toBe(true);
    expect(shouldQueueSessionError('connection reset')).toBe(true);
    expect(shouldQueueSessionError('new row violates row-level security policy')).toBe(false);
    expect(shouldQueueSessionError(undefined)).toBe(false);
  });
});

describe('flushOfflineSessionQueue', () => {
  it('delivers queued sessions and empties the queue', async () => {
    mockEndSession.mockResolvedValue({ ok: true, sessionId: 'abc' });
    await enqueueOfflineSessionJob(completeJob('2026-01-01T10:00:00.000Z'));
    await enqueueOfflineSessionJob(completeJob('2026-01-01T12:00:00.000Z'));

    const result = await flushOfflineSessionQueue();

    expect(result.flushed).toBe(2);
    expect(await getOfflineQueueLength()).toBe(0);
  });

  it('keeps jobs queued while offline and stops hammering the network', async () => {
    mockEndSession.mockResolvedValue({ ok: false, message: 'Network request failed' });
    await enqueueOfflineSessionJob(completeJob('2026-01-01T10:00:00.000Z'));
    await enqueueOfflineSessionJob(completeJob('2026-01-01T12:00:00.000Z'));

    const result = await flushOfflineSessionQueue();

    expect(result.flushed).toBe(0);
    expect(result.remaining).toBe(2);
    // The first failure proves the network is down; the rest are not retried.
    expect(mockEndSession).toHaveBeenCalledTimes(1);
  });

  // Regression: a job the server refuses used to be re-queued forever, so it
  // was retried on every single foreground and never went away.
  it('drops a job the server keeps refusing, after a bounded number of tries', async () => {
    mockEndSession.mockResolvedValue({ ok: false, message: 'invalid input syntax for type uuid' });
    await enqueueOfflineSessionJob(completeJob('2026-01-01T10:00:00.000Z'));

    for (let attempt = 1; attempt < 5; attempt++) {
      const result = await flushOfflineSessionQueue();
      expect(result.remaining).toBe(1);
      expect(result.dropped).toBe(0);
    }

    const final = await flushOfflineSessionQueue();
    expect(final.dropped).toBe(1);
    expect(await getOfflineQueueLength()).toBe(0);
  });

  it('does not block later jobs behind a refused one', async () => {
    mockEndSession
      .mockResolvedValueOnce({ ok: false, message: 'duplicate key value' })
      .mockResolvedValueOnce({ ok: true, sessionId: 'ok' });
    await enqueueOfflineSessionJob(completeJob('2026-01-01T10:00:00.000Z'));
    await enqueueOfflineSessionJob(completeJob('2026-01-01T12:00:00.000Z'));

    const result = await flushOfflineSessionQueue();

    expect(result.flushed).toBe(1);
    expect(result.remaining).toBe(1);
  });

  it('flushes queued journal notes too', async () => {
    mockUpdateNotes.mockResolvedValue({ ok: true });
    await enqueueOfflineSessionJob({
      type: 'update_session_notes',
      sessionId: 'session-1',
      note: 'shipped the parser',
      nextBlock: 'write the tests',
      createdAt: '2026-01-01T10:00:00.000Z',
    });

    const result = await flushOfflineSessionQueue();

    expect(mockUpdateNotes).toHaveBeenCalledWith(
      'session-1',
      'shipped the parser',
      'write the tests',
    );
    expect(result.flushed).toBe(1);
  });
});
