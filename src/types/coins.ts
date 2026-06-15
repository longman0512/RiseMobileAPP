export type CoinType = 'lockin' | 'flow' | 'reset';

export type Coin = {
  coin_id: string;
  user_id: string;
  coin_type: CoinType;
  registered_at: string;
  active: boolean;
};

export const COIN_TYPES: CoinType[] = ['lockin', 'flow', 'reset'];

export const COIN_LABELS: Record<CoinType, string> = {
  lockin: 'LOCK IN',
  flow: 'FLOW',
  reset: 'RESET',
};

export const COIN_ALREADY_LINKED_MESSAGE = 'This coin is already linked to an account';
