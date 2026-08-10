import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoldToConfirm } from '../../components/HoldToConfirm';
import { useSession } from '../../providers/SessionProvider';

/** One prompt, then the shift is sealed and the XP is committed. */
export function ProtocolEndShiftScreen() {
  const insets = useSafeAreaInsets();
  const session = useSession();

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
      >
        <Text style={styles.eyebrow}>END SHIFT</Text>
        <Text style={styles.title}>
          One last{'\n'}
          <Text style={styles.titleLight}>thing.</Text>
        </Text>

        <View style={styles.card}>
          <Text style={styles.question}>First target for tomorrow?</Text>
          <TextInput
            style={styles.input}
            value={session.nextTarget}
            onChangeText={session.setNextTarget}
            placeholder="What you open the day with…"
            placeholderTextColor="#5C5C66"
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.footer}>
          {session.isSaving ? (
            <View style={styles.saving}>
              <ActivityIndicator color="#9A9AA2" />
              <Text style={styles.savingText}>Sealing your shift…</Text>
            </View>
          ) : (
            <HoldToConfirm
              label="End Shift"
              onConfirm={() => void session.confirmEndShift()}
              accent="#F5F5F7"
              inverted
            />
          )}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A0A0C',
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },
  eyebrow: {
    color: '#9A9AA2',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  title: {
    color: '#F5F5F7',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.9,
    lineHeight: 36,
    marginTop: 14,
  },
  titleLight: {
    color: '#9A9AA2',
    fontWeight: '200',
  },
  card: {
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 20,
    padding: 18,
  },
  question: {
    color: '#E8C56A',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.32,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  input: {
    color: '#F5F5F7',
    fontSize: 14,
    fontWeight: '300',
    lineHeight: 23,
    minHeight: 64,
    padding: 0,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 28,
  },
  saving: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  savingText: {
    color: '#9A9AA2',
    fontSize: 13,
  },
});
