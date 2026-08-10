import type { CoinType } from './coins';

/**
 * What a friend is doing right now. Derived from session state rather than from
 * an open connection, so a phone left face-down mid-block still reads correctly.
 */
export type ActivityState = 'offline' | 'lockin' | 'flow' | 'paused';

export type SquadBlock = {
  protocol: CoinType;
  duration_mins: number;
};

export type SquadFriend = {
  link_id: string;
  user_id: string;
  username: string | null;
  state: ActivityState;
  /** Start of the current block (or pause). Null when offline. */
  started_at: string | null;
  /** Start of the whole chain, so elapsed shift time can be shown. */
  shift_started_at: string | null;
  /** Blocks already completed in the current chain. */
  blocks: SquadBlock[];
  /** When the friendship was accepted. */
  since: string | null;
};

export type SquadRequest = {
  link_id: string;
  user_id: string;
  username: string | null;
  created_at: string;
};

export type Squad = {
  myCode: string | null;
  friends: SquadFriend[];
  /** Requests waiting on me to accept or decline. */
  incoming: SquadRequest[];
  /** Requests I sent that are waiting on them. */
  outgoing: SquadRequest[];
};

export const EMPTY_SQUAD: Squad = {
  myCode: null,
  friends: [],
  incoming: [],
  outgoing: [],
};

/**
 * Traffic-light semantics from the spec: green reads "free to interrupt", red
 * reads "do not disturb". Paused sits between Flow and offline.
 */
export const ACTIVITY_META: Record<
  ActivityState,
  { label: string; color: string; description: string }
> = {
  offline: { label: 'Offline', color: '#22C55E', description: 'Not working' },
  flow: { label: 'Flow', color: '#E8C56A', description: 'In a Flow block' },
  lockin: { label: 'Lock In', color: '#EF4444', description: 'Deep in Lock In' },
  paused: { label: 'Paused', color: '#D4855A', description: 'Taking a break' },
};

export const ACTIVITY_ORDER: Record<ActivityState, number> = {
  lockin: 0,
  flow: 1,
  paused: 2,
  offline: 3,
};
