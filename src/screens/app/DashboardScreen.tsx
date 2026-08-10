import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LogOut } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCoinTap } from '../../providers/CoinTapProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useSession } from '../../providers/SessionProvider';
import { focusMinutesByLocalDate, localTodayKey } from '../../lib/sessionAnalytics';
import { fetchSessionHistory } from '../../lib/sessionApi';
import { EMPTY_MY_XP, fetchMyXp, type MyXp } from '../../lib/shiftApi';
import { formatXp } from '../../lib/xp';
import { supabase } from '../../lib/supabase';
import { COIN_LABELS, COIN_TYPES, type CoinType } from '../../types/coins';

const COIN_META: Record<CoinType, { colors: [string, string, string] }> = {
  lockin: { colors: ['#D7DBE0', '#9BA1A9', '#6F757D'] },
  flow: { colors: ['#F0D88A', '#C9A24B', '#8F6F2B'] },
  reset: { colors: ['#E09A6B', '#C0703F', '#82471F'] },
};

function formatDateEyebrow(date: Date): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const day = date.getDate();
  return `${weekday} · ${month} ${day}`.toUpperCase();
}

function formatFocusDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { handleProtocolTrigger, phase } = useSession();
  const { scanCoin, scanning } = useCoinTap();
  const [todayFocusMinutes, setTodayFocusMinutes] = useState(0);
  const [xp, setXp] = useState<MyXp>(EMPTY_MY_XP);

  const dateEyebrow = useMemo(() => formatDateEyebrow(new Date()), []);
  const todayLabel = formatFocusDuration(todayFocusMinutes);
  const idle = phase === 'idle';

  const loadTodayFocus = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setTodayFocusMinutes(0);
      return;
    }

    const [{ sessions }, myXp] = await Promise.all([fetchSessionHistory(userId), fetchMyXp()]);
    const byDate = focusMinutesByLocalDate(sessions);
    setTodayFocusMinutes(byDate.get(localTodayKey()) ?? 0);
    // Committed XP only. A shift in progress stays silent until it is ended.
    setXp(myXp);
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadTodayFocus();
    }, [loadTodayFocus]),
  );

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Logout failed', error.message);
    }
  };

  const onTapZonePress = () => {
    if (!idle || scanning) return;
    if (Platform.OS === 'ios') {
      void scanCoin();
      return;
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>
          RISE<Text style={styles.logoDot}>.</Text>
        </Text>
        <Pressable style={styles.logoutButton} onPress={logout} accessibilityLabel="Log out">
          <LogOut size={16} color="#9A9AA2" strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.greet}>
        <Text style={styles.dateEyebrow}>{dateEyebrow}</Text>
        <Text style={styles.greetTitle}>
          Ready when{'\n'}
          <Text style={styles.greetTitleLight}>you are.</Text>
        </Text>
      </View>

      <Pressable
        style={styles.tapZone}
        onPress={onTapZonePress}
        disabled={!idle || scanning}
        accessibilityLabel="Tap a coin to begin"
      >
        <View style={[styles.ring, styles.ringOuter]} pointerEvents="none" />
        <View style={[styles.ring, styles.ringInner]} pointerEvents="none" />
        <View style={styles.tapCoinWrap}>
          {scanning ? (
            <ActivityIndicator color="#F5F5F7" size="large" />
          ) : (
            <LinearGradient colors={COIN_META.lockin.colors} style={styles.tapCoin}>
              <View style={styles.tapCoinInner} />
            </LinearGradient>
          )}
        </View>
        <Text style={styles.tapTitle}>Tap a coin to begin</Text>
        <Text style={styles.tapSub}>
          {Platform.OS === 'ios'
            ? 'Tap here, then hold your coin to the top of your phone.'
            : 'Hold your coin to the back of your phone.'}
        </Text>
      </Pressable>

      <View style={styles.coinDock}>
        {COIN_TYPES.map((type) => (
          <View key={type} style={styles.dockItem}>
            <LinearGradient colors={COIN_META[type].colors} style={styles.dockCoin}>
              <View style={styles.dockCoinInner} />
            </LinearGradient>
            <Text style={styles.dockName}>{COIN_LABELS[type]}</Text>
          </View>
        ))}
      </View>


      <View style={styles.todayLine}>
        <Text style={styles.todayKey}>Today</Text>
        <Text style={styles.todayValue}>
          {todayLabel} <Text style={styles.todayMuted}>focused</Text>
        </Text>
      </View>

      <View style={styles.xpLine}>
        <Text style={styles.todayKey}>Total XP</Text>
        <Text style={styles.xpValue}>
          {formatXp(xp.totalXp)}{' '}
          <Text style={styles.todayMuted}>
            {xp.totalShifts} shift{xp.totalShifts === 1 ? '' : 's'}
          </Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0C',
    paddingHorizontal: 28,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  logo: {
    color: '#F5F5F7',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  logoDot: {
    color: '#C9A24B',
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  greet: {
    marginTop: 26,
  },
  dateEyebrow: {
    color: '#5C5C66',
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 1.47,
  },
  greetTitle: {
    color: '#F5F5F7',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.9,
    lineHeight: 34,
    marginTop: 10,
  },
  greetTitleLight: {
    color: '#9A9AA2',
    fontWeight: '200',
  },
  tapZone: {
    alignItems: 'center',
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 34,
    overflow: 'hidden',
    paddingBottom: 38,
    paddingTop: 42,
  },
  ring: {
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 9999,
    borderWidth: 1,
    position: 'absolute',
  },
  ringOuter: {
    height: 260,
    top: -40,
    width: 260,
  },
  ringInner: {
    height: 380,
    top: -100,
    width: 380,
  },
  tapCoinWrap: {
    alignItems: 'center',
    height: 120,
    justifyContent: 'center',
    width: 120,
  },
  tapCoin: {
    alignItems: 'center',
    borderRadius: 52,
    height: 104,
    justifyContent: 'center',
    width: 104,
  },
  tapCoinInner: {
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 40,
    borderWidth: 1,
    height: 76,
    width: 76,
  },
  tapTitle: {
    color: '#F5F5F7',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginTop: 24,
  },
  tapSub: {
    color: '#5C5C66',
    fontSize: 12.5,
    fontWeight: '300',
    marginTop: 6,
  },
  coinDock: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  dockItem: {
    alignItems: 'center',
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  dockCoin: {
    alignItems: 'center',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  dockCoinInner: {
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 11,
    borderWidth: 1,
    height: 22,
    width: 22,
  },
  dockName: {
    color: '#9A9AA2',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  todayLine: {
    alignItems: 'baseline',
    borderTopColor: '#222228',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
    paddingTop: 18,
  },
  todayKey: {
    color: '#5C5C66',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  todayValue: {
    color: '#F5F5F7',
    fontSize: 14,
    fontWeight: '600',
  },
  xpLine: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  xpValue: {
    color: '#E8C56A',
    fontSize: 14,
    fontWeight: '700',
  },
  todayMuted: {
    color: '#5C5C66',
    fontWeight: '300',
  },
});
