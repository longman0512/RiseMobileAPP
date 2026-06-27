import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CoinType } from '../../types/coins';

type FeedRow = {
  label: string;
  status: 'blocked' | 'allowed';
};

type Props = {
  protocol: CoinType;
  hasFocusSelection: boolean;
};

function rowsForProtocol(protocol: CoinType, hasFocusSelection: boolean): FeedRow[] {
  if (protocol === 'lockin') {
    if (!hasFocusSelection) {
      return [{ label: 'Configure app limits in Settings', status: 'blocked' }];
    }
    return [
      { label: 'Distraction apps', status: 'blocked' },
      { label: 'Social media', status: 'blocked' },
      { label: 'Selected categories', status: 'blocked' },
    ];
  }

  if (protocol === 'flow') {
    if (!hasFocusSelection) {
      return [{ label: 'Configure FLOW whitelist in Settings', status: 'allowed' }];
    }
    return [
      { label: 'Creative apps', status: 'allowed' },
      { label: 'Music & audio', status: 'allowed' },
      { label: 'Social apps', status: 'blocked' },
    ];
  }

  return [];
}

export function ProtocolAppFeed({ protocol, hasFocusSelection }: Props) {
  const rows = rowsForProtocol(protocol, hasFocusSelection);
  if (rows.length === 0) return null;

  return (
    <View style={styles.feed}>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <View style={styles.icon} />
          <Text style={styles.label}>{row.label}</Text>
          <Text style={[styles.stat, row.status === 'blocked' ? styles.blocked : styles.allowed]}>
            {row.status === 'blocked' ? 'Blocked' : 'Allowed'}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  feed: {
    gap: 8,
    marginHorizontal: 28,
    marginTop: 26,
  },
  row: {
    alignItems: 'center',
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  icon: {
    backgroundColor: '#0F0F12',
    borderColor: '#2E2E36',
    borderRadius: 7,
    borderWidth: 1,
    height: 26,
    width: 26,
  },
  label: {
    color: '#9A9AA2',
    flex: 1,
    fontSize: 12.5,
    fontWeight: '400',
  },
  stat: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  blocked: {
    color: '#E05252',
  },
  allowed: {
    color: '#4ADE80',
  },
});
