import { supabase } from './supabase';
import {
  ACTIVITY_ORDER,
  EMPTY_SQUAD,
  type ActivityState,
  type Squad,
  type SquadBlock,
  type SquadFriend,
  type SquadRequest,
} from '../types/squad';

function logSquadError(context: string, message: string): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[squadApi] ${context}:`, message);
  }
}

type SquadRpcPayload = {
  my_code?: string | null;
  friends?: SquadFriend[] | null;
  incoming?: SquadRequest[] | null;
  outgoing?: SquadRequest[] | null;
};

/** Busiest first, then alphabetically — Lock In at the top, offline at the bottom. */
function sortFriends(friends: SquadFriend[]): SquadFriend[] {
  return [...friends].sort((a, b) => {
    const byState = ACTIVITY_ORDER[a.state] - ACTIVITY_ORDER[b.state];
    if (byState !== 0) return byState;
    return (a.username ?? '').localeCompare(b.username ?? '');
  });
}

/** Everything the Squad tab renders, in a single round trip. */
export async function fetchSquad(): Promise<{ squad: Squad; error?: string }> {
  const { data, error } = await supabase.rpc('get_my_squad');

  if (error) {
    logSquadError('get_my_squad', error.message);
    return { squad: EMPTY_SQUAD, error: error.message };
  }

  const payload = (data ?? {}) as SquadRpcPayload;
  return {
    squad: {
      myCode: payload.my_code ?? null,
      friends: sortFriends(payload.friends ?? []),
      incoming: payload.incoming ?? [],
      outgoing: payload.outgoing ?? [],
    },
  };
}

/**
 * Issue this account's friend code if it doesn't have one. Codes are assigned
 * by the database and are never user-editable; this exists for accounts created
 * before friend codes shipped.
 */
export async function ensureFriendCode(): Promise<string | null> {
  const { data, error } = await supabase.rpc('ensure_my_friend_code');
  if (error) {
    logSquadError('ensure_my_friend_code', error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

export type SquadActionResult = { ok: true } | { ok: false; message: string };

export async function sendFriendRequest(friendCode: string): Promise<SquadActionResult> {
  const code = friendCode.trim().toUpperCase();
  if (!code) {
    return { ok: false, message: 'Enter a friend code.' };
  }

  const { error } = await supabase.rpc('send_friend_request', { p_friend_code: code });
  if (error) {
    logSquadError('send_friend_request', error.message);
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export async function respondToFriendRequest(
  linkId: string,
  accept: boolean,
): Promise<SquadActionResult> {
  const { error } = await supabase.rpc('respond_to_friend_request', {
    p_link_id: linkId,
    p_accept: accept,
  });
  if (error) {
    logSquadError('respond_to_friend_request', error.message);
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

/** Also used to cancel a request you sent — same row either way. */
export async function removeFriend(friendId: string): Promise<SquadActionResult> {
  const { error } = await supabase.rpc('remove_friend', { p_friend_id: friendId });
  if (error) {
    logSquadError('remove_friend', error.message);
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export type PublishStatusInput = {
  state: ActivityState;
  startedAt?: string | null;
  shiftStartedAt?: string | null;
  blocks?: SquadBlock[];
};

/**
 * Last payload we successfully sent. The session lifecycle calls publishStatus
 * from several places that can fire back to back (a block ends, then the
 * session resets), and re-sending an identical row is pure noise.
 */
let lastPublished: string | null = null;

function fingerprint(input: PublishStatusInput): string {
  return JSON.stringify([
    input.state,
    input.startedAt ?? null,
    input.shiftStartedAt ?? null,
    input.blocks ?? [],
  ]);
}

/**
 * Publish what this user is doing so their squad can see it.
 *
 * Fire and forget: never throws and never blocks a session transition. A failed
 * publish means a friend sees a stale light for a while, which is not worth
 * interrupting the user over. The next transition re-publishes.
 */
export async function publishStatus(input: PublishStatusInput): Promise<void> {
  const key = fingerprint(input);
  if (key === lastPublished) return;

  try {
    const { error } = await supabase.rpc('set_my_status', {
      p_state: input.state,
      p_started_at: input.startedAt ?? null,
      p_shift_started_at: input.shiftStartedAt ?? null,
      p_blocks: input.blocks ?? [],
    });

    if (error) {
      logSquadError('set_my_status', error.message);
      return;
    }

    lastPublished = key;
  } catch (e: unknown) {
    logSquadError('set_my_status', e instanceof Error ? e.message : 'unknown error');
  }
}

/** Clear the dedupe cache — call on sign-out so the next user starts fresh. */
export function resetPublishedStatusCache(): void {
  lastPublished = null;
}

/** Convenience wrapper for the common "user stopped working" transition. */
export async function publishOffline(): Promise<void> {
  await publishStatus({ state: 'offline' });
}
