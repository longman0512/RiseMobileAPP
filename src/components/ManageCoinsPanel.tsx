import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { onboardingStyles } from '../screens/onboarding/onboardingLayout';
import {
  cancelNfcRequest,
  isNfcCancelError,
  readCoinRegistrationTagOnce,
  setNfcBusy,
} from '../lib/nfc';
import { suppressProtocolDeepLinks } from '../lib/protocolDeepLink';
import { showErrorToast, showSuccessToast } from '../lib/toast';
import { useCoins } from '../providers/CoinsProvider';
import { COIN_LABELS, COIN_TYPES, type CoinType } from '../types/coins';

const COIN_META: Record<CoinType, { detail: string; colors: [string, string, string]; accent: string }> = {
  lockin: {
    detail: 'Brushed steel · Deep focus',
    colors: ['#D7DBE0', '#9BA1A9', '#6F757D'],
    accent: '#C0C4CC',
  },
  flow: {
    detail: 'Polished brass · Creative focus',
    colors: ['#F0D88A', '#C9A24B', '#8F6F2B'],
    accent: '#E8C56A',
  },
  reset: {
    detail: 'Matte copper · Recovery',
    colors: ['#E09A6B', '#C0703F', '#82471F'],
    accent: '#D4855A',
  },
};

type Props = {
  visible: boolean;
  onClose: () => void;
};

function getRegisteredTypes(coins: ReturnType<typeof useCoins>['coins']) {
  const registered = new Set<CoinType>();
  for (const coin of coins) {
    if (coin.active) registered.add(coin.coin_type);
  }
  return registered;
}

function firstUnpaired(registered: Set<CoinType>): CoinType | null {
  return COIN_TYPES.find((type) => !registered.has(type)) ?? null;
}

export function ManageCoinsPanel({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { coins, registerCoinStrict, deleteCoin, refresh: refreshCoins } = useCoins();

  const registeredTypes = useMemo(() => getRegisteredTypes(coins), [coins]);
  const [activeType, setActiveType] = useState<CoinType | null>(null);
  const [registering, setRegistering] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!visible) {
      setActiveType(null);
      setRegistering(false);
      setListening(false);
      return;
    }
    setActiveType(firstUnpaired(registeredTypes));
  }, [visible, registeredTypes]);

  useLayoutEffect(() => {
    if (!visible) return undefined;
    return suppressProtocolDeepLinks();
  }, [visible]);

  useEffect(() => {
    if (!visible || !activeType || registeredTypes.has(activeType)) {
      setListening(false);
      return undefined;
    }

    let cancelled = false;

    const scan = async () => {
      setListening(true);
      setNfcBusy(true);
      try {
        while (!cancelled && activeType && !getRegisteredTypes(coins).has(activeType)) {
          try {
            const tag = await readCoinRegistrationTagOnce();
            if (cancelled) return;

            setRegistering(true);
            // Register by UID as the currently-selected type. The coin's NDEF URL
            // is intentionally ignored here — it is reserved for the tap-to-open
            // Universal Link, and the type is chosen by the user in the UI.
            const result = await registerCoinStrict(tag.coinId, activeType);
            if (!result.ok) {
              showErrorToast('Registration failed', result.message);
              continue;
            }

            showSuccessToast('Registered', `${COIN_LABELS[activeType]} coin linked to your account.`);
            await refreshCoins();
            break;
          } catch (e: unknown) {
            if (isNfcCancelError(e) || cancelled) break;
            showErrorToast(
              'Registration failed',
              e instanceof Error ? e.message : 'NFC is unavailable.',
            );
            break;
          } finally {
            setRegistering(false);
          }
        }
      } finally {
        if (!cancelled) {
          setListening(false);
          setNfcBusy(false);
        }
      }
    };

    void scan();

    return () => {
      cancelled = true;
      setListening(false);
      setNfcBusy(false);
      void cancelNfcRequest();
    };
  }, [activeType, coins, refreshCoins, registerCoinStrict, registeredTypes, visible]);

  const selectCoin = useCallback(
    (type: CoinType) => {
      const existing = coins.find((c) => c.active && c.coin_type === type);
      if (existing) {
        Alert.alert(
          `Replace ${COIN_LABELS[type]} coin?`,
          'Delete the current coin, then hold the new one near your phone.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete & replace',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  const result = await deleteCoin(existing.coin_id);
                  if (!result.ok) {
                    Alert.alert('Delete failed', result.message);
                    return;
                  }
                  setActiveType(type);
                })();
              },
            },
          ],
        );
        return;
      }
      setActiveType(type);
    },
    [coins, deleteCoin],
  );

  const handleClose = useCallback(async () => {
    await cancelNfcRequest();
    setNfcBusy(false);
    onClose();
  }, [onClose]);

  const activeLabel = activeType ? COIN_LABELS[activeType] : 'coin';
  const allPaired = registeredTypes.size === COIN_TYPES.length;
  const waiting = activeType != null && !registeredTypes.has(activeType);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => void handleClose()}>
      <View style={styles.root}>
        <View style={[styles.content, { paddingTop: insets.top + 18 }]}>
          <View style={onboardingStyles.hero}>
            <Text style={onboardingStyles.title}>
              Manage{'\n'}
              <Text style={onboardingStyles.titleLight}>coins.</Text>
            </Text>
            <Text style={onboardingStyles.subtitle}>
              Re-pair a lost or replaced coin — the new UID maps to the same protocol.
            </Text>
          </View>

          <View style={styles.coinList}>
            {COIN_TYPES.map((type) => {
              const done = registeredTypes.has(type);
              const active = activeType === type && !done;
              const meta = COIN_META[type];

              return (
                <Pressable
                  key={type}
                  style={[styles.coinRow, active ? styles.coinRowActive : null]}
                  onPress={() => selectCoin(type)}
                >
                  <LinearGradient
                    colors={meta.colors}
                    style={[styles.coin, !done && !active ? styles.coinDim : null]}
                  >
                    <View style={styles.coinInner} />
                  </LinearGradient>
                  <View style={styles.coinMeta}>
                    <Text style={styles.coinName}>{COIN_LABELS[type]}</Text>
                    <Text style={styles.coinSub}>{meta.detail}</Text>
                  </View>
                  <View style={styles.stateWrap}>
                    {done ? (
                      <View style={styles.doneWrap}>
                        <Text style={styles.doneText}>PAIRED</Text>
                        <Check size={12} color="#22C55E" strokeWidth={3} />
                      </View>
                    ) : (
                      <Text style={[styles.waitText, active ? { color: meta.accent } : null]}>
                        {active && registering ? 'PAIRING...' : 'WAITING...'}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.scanHint}>
            <View style={styles.nfcPulse}>
              <View style={styles.nfcRingOuter} />
              <View style={styles.nfcRingInner} />
            </View>
            <Text style={styles.scanCopy}>
              {allPaired && !waiting ? (
                'All three coins are paired. Tap one above to replace it.'
              ) : waiting ? (
                <>
                  Hold the <Text style={styles.scanStrong}>{activeLabel}</Text> coin near the top edge
                  of your phone.
                </>
              ) : (
                'Tap a coin type above to pair or replace it.'
              )}
            </Text>
            {registering || listening ? (
              <ActivityIndicator color="#F5F5F7" style={styles.scanSpinner} />
            ) : null}
          </View>
        </View>

        <View style={[onboardingStyles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <Pressable style={onboardingStyles.continueButton} onPress={() => void handleClose()}>
            <Text style={onboardingStyles.continueText}>Back to settings</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    ...onboardingStyles.root,
    flex: 1,
  },
  content: {
    ...onboardingStyles.content,
    paddingHorizontal: 28,
  },
  coinList: {
    gap: 12,
  },
  coinRow: {
    alignItems: 'center',
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  coinRowActive: {
    borderColor: '#2E2E36',
  },
  coin: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  coinDim: {
    opacity: 0.48,
  },
  coinInner: {
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    width: 32,
  },
  coinMeta: {
    flex: 1,
  },
  coinName: {
    color: '#F5F5F7',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  coinSub: {
    color: '#5C5C66',
    fontSize: 11,
    fontWeight: '300',
    marginTop: 2,
  },
  stateWrap: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  doneWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  doneText: {
    color: '#22C55E',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  waitText: {
    color: '#5C5C66',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  scanHint: {
    alignItems: 'center',
    borderColor: '#2E2E36',
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginTop: 24,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  nfcPulse: {
    alignItems: 'center',
    borderColor: '#9A9AA2',
    borderRadius: 19,
    borderWidth: 1.5,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  nfcRingOuter: {
    borderColor: 'rgba(92,92,102,0.25)',
    borderRadius: 33,
    borderWidth: 1,
    height: 66,
    position: 'absolute',
    width: 66,
  },
  nfcRingInner: {
    borderColor: 'rgba(92,92,102,0.5)',
    borderRadius: 26,
    borderWidth: 1,
    height: 52,
    position: 'absolute',
    width: 52,
  },
  scanCopy: {
    color: '#9A9AA2',
    flex: 1,
    fontSize: 12.5,
    fontWeight: '300',
    lineHeight: 20,
  },
  scanStrong: {
    color: '#F5F5F7',
    fontWeight: '600',
  },
  scanSpinner: {
    marginLeft: 4,
  },
});
