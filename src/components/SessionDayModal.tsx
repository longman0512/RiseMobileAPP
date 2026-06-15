import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import type { SessionRecord } from '../lib/sessionApi';
import { COIN_LABELS, type CoinType } from '../types/coins';

type Props = {
  visible: boolean;
  date: string | null;
  sessions: SessionRecord[];
  onClose: () => void;
};

function formatModalDate(dateKey: string): string {
  try {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateKey;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function SessionDayModal({ visible, date, sessions, onClose }: Props) {
  if (!date) return null;

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/80 justify-end">
        <View className="bg-[#141414] rounded-t-3xl border border-white/10 max-h-[75%]">
          <View className="flex-row items-center justify-between px-6 pt-5 pb-3 border-b border-white/10">
            <Text className="text-white text-lg font-semibold">{formatModalDate(date)}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text className="text-zinc-400 text-base font-medium">Close</Text>
            </Pressable>
          </View>

          <ScrollView
            className="px-6 py-4"
            contentContainerStyle={{ paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {sessions.length === 0 ? (
              <Text className="text-zinc-500 text-center py-8 text-sm">
                No sessions recorded this day.
              </Text>
            ) : (
              <View className="gap-3">
                {sortedSessions.map((item, index) => {
                  const type = item.coin_type as CoinType;
                  return (
                    <View
                      key={item.session_id ?? `${item.started_at}-${index}`}
                      className="rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-4"
                    >
                      <View className="flex-row justify-between items-center">
                        <Text className="text-white font-semibold">
                          {COIN_LABELS[type] ?? type}
                        </Text>
                        <Text className="text-zinc-500 text-sm">{formatTime(item.started_at)}</Text>
                      </View>
                      <Text className="text-zinc-400 mt-1 text-sm">{item.duration_mins} min</Text>
                      {item.note ? (
                        <Text className="text-zinc-500 mt-2 text-sm" numberOfLines={3}>
                          {item.note}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
