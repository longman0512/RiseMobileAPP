import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '../../providers/SessionProvider';

/** The two close-out prompts, between the tiredness check and the rest screen. */
export function ProtocolCloseoutScreen() {
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
        <Text style={styles.eyebrow}>CLOSE OUT</Text>
        <Text style={styles.title}>
          Before you{'\n'}
          <Text style={styles.titleLight}>step away.</Text>
        </Text>

        <View style={styles.card}>
          <Text style={styles.question}>What was completed?</Text>
          <TextInput
            style={styles.input}
            value={session.closeoutDone}
            onChangeText={session.setCloseoutDone}
            placeholder="Type it, or write it in your notebook…"
            placeholderTextColor="#5C5C66"
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.question}>Next target?</Text>
          <TextInput
            style={styles.input}
            value={session.closeoutNext}
            onChangeText={session.setCloseoutNext}
            placeholder="What you pick up after the break…"
            placeholderTextColor="#5C5C66"
            multiline
            textAlignVertical="top"
          />
        </View>

        <Text style={styles.hint}>
          Both optional. Your {session.pauseMinutes}-minute break starts next.
        </Text>

        <Pressable style={styles.continueButton} onPress={session.finishCloseout}>
          <Text style={styles.continueText}>Start the break</Text>
        </Pressable>
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
    color: '#D4855A',
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
    marginTop: 16,
    padding: 18,
  },
  question: {
    color: '#D4855A',
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
    minHeight: 56,
    padding: 0,
  },
  hint: {
    color: '#5C5C66',
    fontSize: 12,
    fontWeight: '300',
    marginTop: 18,
    textAlign: 'center',
  },
  continueButton: {
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
    marginTop: 'auto',
  },
  continueText: {
    color: '#0A0A0C',
    fontSize: 14.5,
    fontWeight: '600',
  },
});
