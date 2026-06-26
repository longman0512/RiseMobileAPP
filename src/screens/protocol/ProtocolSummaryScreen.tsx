import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { formatSegmentBreakdown } from '../../lib/sessionApi';
import type { ProtocolStackParamList } from '../../navigation/protocol/ProtocolNavigator';
import { useSession } from '../../providers/SessionProvider';
import { COIN_LABELS } from '../../types/coins';

type Props = NativeStackScreenProps<ProtocolStackParamList, 'Summary'>;

export function ProtocolSummaryScreen({ route }: Props) {
  const { protocol } = route.params;
  const session = useSession();
  const summary = session.summary;
  const saving = session.isSavingSession;

  if (protocol !== 'lockin') {
    return (
      <View className="flex-1 bg-[#0A0A0C] items-center justify-center px-6">
        <Text className="text-white text-center">This screen is only used after LOCK IN sessions.</Text>
      </View>
    );
  }

  if (!summary) {
    return (
      <View className="flex-1 bg-[#0A0A0C] items-center justify-center">
        <Text className="text-white">No session data</Text>
      </View>
    );
  }

  const durationLine =
    summary.overtimeMinutes > 0
      ? `${summary.plannedMinutes} min + ${summary.overtimeMinutes} min extra`
      : `${summary.actualMinutes} min`;

  const showBreakdown = summary.segments.length > 1;

  return (
    <View className="flex-1 bg-[#0A0A0C] px-6 py-16 justify-center">
      <Text className="text-white text-3xl font-bold text-center">{COIN_LABELS.lockin}</Text>
      <Text className="text-zinc-400 text-center mt-4 text-lg">{durationLine}</Text>

      {showBreakdown ? (
        <Text className="text-zinc-500 text-center mt-6 text-sm px-2">
          {formatSegmentBreakdown(summary.segments)}
        </Text>
      ) : null}

      {summary.focusMinutes > 0 ? (
        <Text className="text-zinc-500 text-center mt-4 text-sm">
          Focus time: {summary.focusMinutes} min
        </Text>
      ) : null}

      {summary.recoveryMinutes > 0 ? (
        <Text className="text-zinc-500 text-center mt-2 text-sm">
          Recovery time: {summary.recoveryMinutes} min
        </Text>
      ) : null}

      <Text className="text-zinc-500 text-center mt-10 text-sm">Consider RESET to recover.</Text>

      <Text className="text-zinc-600 text-center mt-4 text-xs">
        {saving ? 'Saving to your history…' : 'Session saved to your history.'}
      </Text>

      <Pressable
        className={[
          'mt-12 h-14 rounded-2xl items-center justify-center flex-row gap-2',
          saving ? 'bg-white/50' : 'bg-white',
        ].join(' ')}
        onPress={() => void session.finishSummary()}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#000" /> : null}
        <Text className="text-black font-semibold">{saving ? 'Saving…' : 'Done'}</Text>
      </Pressable>

      <Pressable className="mt-4 h-10 items-center justify-center" onPress={() => session.cancelSession()}>
        <Text className="text-zinc-500 text-sm">Back to main</Text>
      </Pressable>
    </View>
  );
}
