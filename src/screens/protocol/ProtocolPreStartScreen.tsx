import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DurationSlider, snapDurationMinutes } from '../../components/DurationSlider';
import type { ProtocolStackParamList } from '../../navigation/protocol/ProtocolNavigator';
import { openFocusSettings } from '../../lib/focusSettings';
import { PROTOCOL_CONFIG } from '../../lib/protocolConfig';
import { PROTOCOL_THEME } from '../../lib/protocolTheme';
import { useSession } from '../../providers/SessionProvider';
import { COIN_LABELS } from '../../types/coins';

type Props = NativeStackScreenProps<ProtocolStackParamList, 'PreStart'>;

export function ProtocolPreStartScreen({ route }: Props) {
  const { protocol } = route.params;
  const session = useSession();
  const config = PROTOCOL_CONFIG[protocol];
  const theme = PROTOCOL_THEME[protocol];
  const insets = useSafeAreaInsets();

  const presets = config.durationPresets ?? [];
  const [minutes, setMinutes] = useState(() =>
    snapDurationMinutes(config.defaultMinutes, config.minMinutes, config.maxMinutes),
  );

  useEffect(() => {
    setMinutes(snapDurationMinutes(config.defaultMinutes, config.minMinutes, config.maxMinutes));
  }, [config.defaultMinutes, config.maxMinutes, config.minMinutes, protocol]);

  const onBegin = () => {
    session.beginSession(protocol === 'flow' ? undefined : minutes);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <Pressable onPress={() => session.cancelSession()} hitSlop={12} style={styles.close}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>

      <Text style={[styles.protocolTitle, { color: theme.accent }]}>{COIN_LABELS[protocol]}</Text>

      {protocol === 'lockin' ? (
        <>
          <Text style={styles.durationHint}>
            Set duration ({config.minMinutes}–{config.maxMinutes} min)
          </Text>
          {presets.length > 0 ? (
            <View style={styles.presets}>
              {presets.map((preset) => {
                const selected = minutes === preset;
                return (
                  <Pressable
                    key={preset}
                    style={[styles.preset, selected && { borderColor: theme.accent }]}
                    onPress={() => setMinutes(preset)}
                  >
                    <Text style={[styles.presetText, selected && { color: theme.accent }]}>
                      {preset}m
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={styles.sliderWrap}>
            <DurationSlider
              minMinutes={config.minMinutes}
              maxMinutes={config.maxMinutes}
              stepMinutes={1}
              value={minutes}
              onChange={setMinutes}
            />
          </View>
        </>
      ) : protocol === 'flow' ? (
        <Text style={styles.durationHint}>Open-ended · counts up</Text>
      ) : (
        <Text style={styles.durationHint}>
          Set duration ({config.minMinutes}–{config.maxMinutes} min)
        </Text>
      )}

      {protocol !== 'flow' && protocol !== 'lockin' ? (
        <View style={styles.sliderWrap}>
          <DurationSlider
            minMinutes={config.minMinutes}
            maxMinutes={config.maxMinutes}
            stepMinutes={1}
            value={minutes}
            onChange={setMinutes}
          />
        </View>
      ) : null}

      <Text style={styles.placeCoin}>Place your coin on the desk.</Text>

      {protocol === 'flow' ? (
        <Text style={styles.flowNote}>
          Priority contacts can reach you when Focus Mode is configured.
        </Text>
      ) : null}

      <Pressable onPress={openFocusSettings}>
        <Text style={styles.focusLink}>Configure Focus Mode in Settings (recommended)</Text>
      </Pressable>

      <View style={styles.footer}>
        <Pressable style={styles.startButton} onPress={onBegin}>
          <Text style={styles.startText}>START</Text>
        </Pressable>
        <Pressable style={styles.backButton} onPress={() => session.cancelSession()}>
          <Text style={styles.backText}>Back to main</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A0A0C',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  close: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: 24,
    top: 56,
    width: 40,
    zIndex: 1,
  },
  closeText: {
    color: '#9A9AA2',
    fontSize: 24,
  },
  protocolTitle: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  durationHint: {
    color: '#9A9AA2',
    fontSize: 14,
    marginTop: 40,
    textAlign: 'center',
  },
  presets: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 16,
  },
  preset: {
    borderColor: '#222228',
    borderRadius: 100,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  presetText: {
    color: '#9A9AA2',
    fontSize: 13,
    fontWeight: '600',
  },
  sliderWrap: {
    marginTop: 24,
    paddingHorizontal: 8,
  },
  placeCoin: {
    color: '#5C5C66',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  flowNote: {
    color: '#5C5C66',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 24,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  focusLink: {
    color: '#5C5C66',
    fontSize: 14,
    marginTop: 32,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  footer: {
    gap: 4,
    marginTop: 'auto',
    paddingTop: 32,
  },
  startButton: {
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
  },
  startText: {
    color: '#0A0A0C',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
  },
  backText: {
    color: '#5C5C66',
    fontSize: 14,
  },
});
