import React from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { formatSegmentBreakdown } from '../../lib/sessionApi';
import type { ProtocolStackParamList } from '../../navigation/protocol/ProtocolNavigator';
import { useSession } from '../../providers/SessionProvider';

type Props = NativeStackScreenProps<ProtocolStackParamList, 'Journal'>;

const END_SUGGESTIONS: Record<'flow' | 'reset', string> = {
  flow: 'Consider RESET when you need a break.',
  reset: 'Ready for LOCK IN or FLOW?',
};

export function ProtocolJournalScreen({ route }: Props) {
  const { protocol } = route.params;
  const session = useSession();
  const saving = session.isSavingSession;
  const summary = session.summary;

  if (protocol !== 'flow' && protocol !== 'reset') {
    return (
      <View className="flex-1 bg-[#0D0D0D] items-center justify-center px-6">
        <Text className="text-white text-center">This screen is only used after FLOW or RESET sessions.</Text>
      </View>
    );
  }

  const field1Label =
    protocol === 'flow' ? 'What did you work on?' : 'What did you just do?';
  const field2Label = protocol === 'flow' ? "What's left to finish?" : "What's next?";
  const suggestion = END_SUGGESTIONS[protocol];

  const showTimeline = (summary?.segments.length ?? 0) > 1;
  const showTotals =
    summary != null && (summary.focusMinutes > 0 || summary.recoveryMinutes > 0);
  const overtimeLine =
    summary && summary.overtimeMinutes > 0
      ? `${summary.plannedMinutes} min + ${summary.overtimeMinutes} min extra`
      : null;

  return (
    <View className="flex-1 bg-[#0D0D0D] px-6 py-12">
      <Text className="text-white text-2xl font-bold">Reflection</Text>
      <Text className="text-zinc-500 mt-2 text-sm">Optional — skip anytime</Text>

      {overtimeLine ? (
        <Text className="text-zinc-400 text-center mt-6 text-sm">{overtimeLine}</Text>
      ) : null}

      {showTotals && summary ? (
        <View className="mt-4 gap-1">
          {summary.focusMinutes > 0 ? (
            <Text className="text-zinc-400 text-center text-sm">
              Focus time: {summary.focusMinutes} min
            </Text>
          ) : null}
          {summary.recoveryMinutes > 0 ? (
            <Text className="text-zinc-400 text-center text-sm">
              Recovery time: {summary.recoveryMinutes} min
            </Text>
          ) : null}
          {showTimeline ? (
            <Text className="text-zinc-600 text-center text-xs mt-2 px-1">
              {formatSegmentBreakdown(summary.segments)}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Text className="text-zinc-400 mt-8 text-sm">{field1Label}</Text>
      <TextInput
        className="mt-2 h-12 rounded-xl border border-white/10 bg-zinc-900/80 px-4 text-white"
        value={session.journalNote}
        onChangeText={session.setJournalNote}
        placeholderTextColor="#52525b"
        editable={!saving}
      />

      <Text className="text-zinc-400 mt-6 text-sm">{field2Label}</Text>
      <TextInput
        className="mt-2 h-12 rounded-xl border border-white/10 bg-zinc-900/80 px-4 text-white"
        value={session.journalNextBlock}
        onChangeText={session.setJournalNextBlock}
        placeholderTextColor="#52525b"
        editable={!saving}
      />

      <Text className="text-zinc-500 text-center mt-10 text-sm">{suggestion}</Text>

      <View className="flex-1" />

      {protocol === 'flow' ? (
        <Pressable
          className="mb-4 h-12 rounded-xl border border-white/15 items-center justify-center"
          onPress={session.extendFlowTwentyMinutes}
          disabled={saving}
        >
          <Text className="text-white font-medium">Extend 20 min</Text>
        </Pressable>
      ) : null}

      <Pressable
        className={[
          'h-12 rounded-xl items-center justify-center mb-3 flex-row gap-2',
          saving ? 'bg-white/50' : 'bg-white',
        ].join(' ')}
        onPress={() => void session.saveJournal()}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#000" /> : null}
        <Text className="text-black font-semibold">{saving ? 'Saving…' : 'Save'}</Text>
      </Pressable>

      <Pressable
        className="h-12 items-center justify-center"
        onPress={() => void session.skipJournal()}
        disabled={saving}
      >
        <Text className={saving ? 'text-zinc-600' : 'text-zinc-400'}>Skip</Text>
      </Pressable>

      <Pressable className="h-10 items-center justify-center" onPress={() => session.cancelSession()}>
        <Text className="text-zinc-600 text-sm">Back to main</Text>
      </Pressable>
    </View>
  );
}
