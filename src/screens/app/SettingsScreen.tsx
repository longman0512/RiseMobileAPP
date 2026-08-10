import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Contacts from 'react-native-contacts';
import type { Contact } from 'react-native-contacts';

import { AppBlockPickerModal } from '../../components/AppBlockPickerModal';
import { ManageCoinsPanel } from '../../components/ManageCoinsPanel';
import {
  hasFocusModeSelection,
  isFocusModeAuthorized,
  presentFocusModePicker,
  requestFocusModeAuthorization,
  showFocusModeSetupUnavailableAlert,
} from '../../lib/focusMode';
import { lockInDefaultLabel, resetDefaultLabel } from '../../lib/journeyFormat';
import { requestContactsPermission } from '../../lib/permissions';
import { supabase } from '../../lib/supabase';
import { PROTOCOL_CONFIG } from '../../lib/protocolConfig';
import { PROTOCOL_THEME } from '../../lib/protocolTheme';
import { useAuth } from '../../providers/AuthProvider';
import { useCoins } from '../../providers/CoinsProvider';
import { useSquadCode } from '../../providers/SquadProvider';
import { formatFriendCode } from '../../lib/squadFormat';
import { useUserPreferences } from '../../providers/UserPreferencesProvider';
import { COIN_LABELS, COIN_TYPES, type CoinType } from '../../types/coins';

type Panel = 'none' | 'coins' | 'account' | 'flow';

function SettingsToggle({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: '#2E2E36', true: '#4ADE80' }}
      thumbColor="#F5F5F7"
    />
  );
}

function ProtocolIcon({ color, round = true }: { color: string; round?: boolean }) {
  return (
    <View style={[styles.setIcon, round ? styles.setIconRound : styles.setIconSquare]}>
      <View style={[styles.setIconInner, round && styles.setIconInnerRound, { borderColor: color }]} />
    </View>
  );
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { session, refreshProfile } = useAuth();
  const { coins } = useCoins();
  const prefs = useUserPreferences();

  const [panel, setPanel] = useState<Panel>('none');
  const [editingContacts, setEditingContacts] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(
    () => new Set(prefs.priorityContactIds),
  );
  const [screenTimeAuthorized, setScreenTimeAuthorized] = useState(false);
  const [blockingSelections, setBlockingSelections] = useState<Record<'lockin' | 'flow', boolean>>({
    lockin: false,
    flow: false,
  });
  const [blockingBusy, setBlockingBusy] = useState<CoinType | null>(null);
  const [blockingPickerProtocol, setBlockingPickerProtocol] = useState<'lockin' | 'flow' | null>(null);
  const isAndroid = Platform.OS === 'android';

  const email = session?.user?.email ?? '';
  const initialUsername = (session?.user?.user_metadata?.username as string | undefined) ?? '';
  const [username, setUsername] = useState(initialUsername);
  const { myCode } = useSquadCode();
  const [savingUsername, setSavingUsername] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    setUsername(initialUsername);
  }, [initialUsername]);

  const refreshBlockingStatus = useCallback(async () => {
    const [authorized, lockin, flow] = await Promise.all([
      isFocusModeAuthorized(),
      hasFocusModeSelection('lockin'),
      hasFocusModeSelection('flow'),
    ]);
    setScreenTimeAuthorized(authorized);
    setBlockingSelections({ lockin, flow });
  }, []);

  useEffect(() => {
    refreshBlockingStatus().catch(() => {});
  }, [refreshBlockingStatus]);

  // Re-check after returning from Android's Accessibility settings.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshBlockingStatus().catch(() => {});
    });
    return () => sub.remove();
  }, [refreshBlockingStatus]);

  const pairedCount = useMemo(
    () => coins.filter((c) => c.active).length,
    [coins],
  );

  const onChooseBlockingApps = useCallback(
    async (protocol: 'lockin' | 'flow') => {
      setBlockingBusy(protocol);
      try {
        let isAuthorized = screenTimeAuthorized;
        if (!isAuthorized) {
          isAuthorized = await requestFocusModeAuthorization();
          setScreenTimeAuthorized(isAuthorized);
        }
        if (isAuthorized) {
          if (isAndroid) {
            // Android has no native picker — open the in-app app list.
            setBlockingPickerProtocol(protocol);
            return;
          }
          const saved = await presentFocusModePicker(protocol);
          if (!saved) showFocusModeSetupUnavailableAlert('picker');
        } else {
          showFocusModeSetupUnavailableAlert('authorization');
        }
        await refreshBlockingStatus();
      } finally {
        setBlockingBusy(null);
      }
    },
    [isAndroid, refreshBlockingStatus, screenTimeAuthorized],
  );

  const onProtocolRow = useCallback(
    (type: CoinType) => {
      if (type === 'reset') {
        Alert.alert(
          'Reset',
          `${PROTOCOL_CONFIG.reset.defaultMinutes} min recovery with two optional reflection prompts. Writing can stay blank — use your notebook if you prefer.`,
        );
        return;
      }
      if (type === 'flow') {
        setPanel('flow');
        return;
      }
      void onChooseBlockingApps(type);
    },
    [onChooseBlockingApps],
  );

  const protocolSubtitle = useCallback(
    (type: CoinType): string => {
      if (type === 'lockin') {
        return `${blockingSelections.lockin ? 'Apps blocked' : 'No blocklist'} · ${lockInDefaultLabel()}`;
      }
      if (type === 'flow') {
        return `${blockingSelections.flow ? 'Whitelist configured' : 'No whitelist'} · open-ended`;
      }
      return resetDefaultLabel();
    },
    [blockingSelections],
  );

  const onSaveUsername = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    const clean = username.trim();
    if (clean.length < 3) {
      Alert.alert('Username too short', 'Use at least 3 characters.');
      return;
    }
    setSavingUsername(true);
    try {
      const { error } = await supabase.from('profiles').upsert({ id: userId, username: clean });
      if (error) {
        Alert.alert('Failed', error.message);
        return;
      }
      await supabase.auth.updateUser({ data: { username: clean } });
      await refreshProfile();
      Alert.alert('Saved', 'Username updated.');
    } finally {
      setSavingUsername(false);
    }
  }, [refreshProfile, session?.user?.id, username]);

  const onChangePassword = useCallback(async () => {
    if (!email || currentPassword.length === 0 || newPassword.length < 8) return;
    setChangingPassword(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: currentPassword,
      });
      if (verifyError) {
        Alert.alert('Current password is incorrect', verifyError.message);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) Alert.alert('Failed', error.message);
      else {
        setCurrentPassword('');
        setNewPassword('');
        Alert.alert('Updated', 'Password changed.');
      }
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, email, newPassword]);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 28,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>Settings</Text>
        <Text style={styles.title}>
          Make it yours.{'\n'}
          <Text style={styles.titleLight}>Once.</Text>
        </Text>

        <Text style={styles.groupHd}>Protocols</Text>
        <View style={styles.card}>
          {COIN_TYPES.map((type, index) => {
            const theme = PROTOCOL_THEME[type];
            const busy = blockingBusy === type;
            return (
              <Pressable
                key={type}
                style={[styles.row, index < COIN_TYPES.length - 1 && styles.rowBorder]}
                onPress={() => onProtocolRow(type)}
                disabled={busy}
              >
                <ProtocolIcon color={theme.accent} />
                <View style={styles.rowTxt}>
                  <Text style={styles.rowName}>{COIN_LABELS[type]}</Text>
                  <Text style={styles.rowSub}>{busy ? 'Opening…' : protocolSubtitle(type)}</Text>
                </View>
                <Text style={styles.chev}>›</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.groupHd}>Coins</Text>
        <View style={styles.card}>
          <Pressable style={[styles.row, styles.rowBorder]} onPress={() => setPanel('coins')}>
            <ProtocolIcon color="#C0C4CC" />
            <View style={styles.rowTxt}>
              <Text style={styles.rowName}>Manage coins</Text>
              <Text style={styles.rowSub}>
                {pairedCount} paired · re-pair or replace
              </Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
          <View style={styles.row}>
            <ProtocolIcon color="#9A9AA2" round={false} />
            <View style={styles.rowTxt}>
              <Text style={styles.rowName}>Background tap</Text>
              <Text style={styles.rowSub}>Start protocols with app closed</Text>
            </View>
            <SettingsToggle
              value={prefs.backgroundTapEnabled}
              onValueChange={(v) => void prefs.setBackgroundTapEnabled(v)}
            />
          </View>
        </View>

        <Text style={styles.groupHd}>General</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowBorder]}>
            <ProtocolIcon color="#9A9AA2" round={false} />
            <View style={styles.rowTxt}>
              <Text style={styles.rowName}>Sounds & haptics</Text>
            </View>
            <SettingsToggle
              value={prefs.soundsHapticsEnabled}
              onValueChange={(v) => void prefs.setSoundsHapticsEnabled(v)}
            />
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <ProtocolIcon color="#9A9AA2" round={false} />
            <View style={styles.rowTxt}>
              <Text style={styles.rowName}>Live Activity</Text>
              <Text style={styles.rowSub}>Timer on lock screen</Text>
            </View>
            <SettingsToggle
              value={prefs.liveActivityEnabled}
              onValueChange={(v) => void prefs.setLiveActivityEnabled(v)}
            />
          </View>
          <Pressable style={styles.row} onPress={() => setPanel('account')}>
            <ProtocolIcon color="#9A9AA2" />
            <View style={styles.rowTxt}>
              <Text style={styles.rowName}>Account</Text>
              <Text style={styles.rowSub}>{email || 'Signed in'}</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ManageCoinsPanel visible={panel === 'coins'} onClose={() => setPanel('none')} />

      {isAndroid && blockingPickerProtocol ? (
        <AppBlockPickerModal
          visible
          protocol={blockingPickerProtocol}
          onClose={() => {
            setBlockingPickerProtocol(null);
            refreshBlockingStatus().catch(() => {});
          }}
        />
      ) : null}

      <Modal visible={panel === 'flow'} animationType="slide" onRequestClose={() => setPanel('none')}>
        <View style={[styles.modalRoot, { paddingTop: insets.top + 12 }]}>
          <Text style={[styles.modalTitle, { color: PROTOCOL_THEME.flow.accent }]}>Flow setup</Text>
          <Text style={styles.modalSub}>Whitelist and priority contacts — configure once here.</Text>
          <Pressable style={styles.modalSecondary} onPress={() => void onChooseBlockingApps('flow')}>
            <Text style={styles.modalSecondaryText}>Edit app whitelist</Text>
          </Pressable>
          <Pressable
            style={styles.modalSecondary}
            onPress={async () => {
              setEditingContacts(true);
              setSelectedContactIds(new Set(prefs.priorityContactIds));
              setContactsLoading(true);
              if (await requestContactsPermission()) {
                try {
                  setAllContacts(await Contacts.getAll());
                } catch {
                  Alert.alert('Contacts', 'Could not load contacts.');
                }
              }
              setContactsLoading(false);
            }}
          >
            <Text style={styles.modalSecondaryText}>
              Priority contacts ({prefs.priorityContactIds.length})
            </Text>
          </Pressable>
          <Pressable style={styles.modalClose} onPress={() => setPanel('none')}>
            <Text style={styles.modalCloseText}>Done</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal visible={panel === 'account'} animationType="slide" onRequestClose={() => setPanel('none')}>
        <ScrollView
          contentContainerStyle={[styles.modalRoot, { paddingTop: insets.top + 12, paddingBottom: 40 }]}
        >
          <Text style={styles.modalTitle}>Account</Text>
          <Text style={styles.fieldLabel}>Email</Text>
          <Text style={styles.fieldValue}>{email || '—'}</Text>
          <Text style={styles.fieldLabel}>Username</Text>
          <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" />
          <Pressable style={styles.modalPrimary} onPress={() => void onSaveUsername()} disabled={savingUsername}>
            <Text style={styles.modalPrimaryText}>{savingUsername ? 'Saving…' : 'Save username'}</Text>
          </Pressable>
          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Squad code</Text>
          <Text style={styles.codeValue}>{formatFriendCode(myCode)}</Text>
          <Text style={styles.codeHint}>
            Share this so friends can add you. It is assigned automatically and cannot be changed.
          </Text>
          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Change password</Text>
          <TextInput
            style={styles.input}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            placeholder="Current password"
            placeholderTextColor="#5C5C66"
          />
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="New password (min 8)"
            placeholderTextColor="#5C5C66"
          />
          <Pressable style={styles.modalPrimary} onPress={() => void onChangePassword()} disabled={changingPassword}>
            <Text style={styles.modalPrimaryText}>{changingPassword ? 'Updating…' : 'Update password'}</Text>
          </Pressable>
          <Pressable style={styles.modalClose} onPress={() => setPanel('none')}>
            <Text style={styles.modalCloseText}>Done</Text>
          </Pressable>
        </ScrollView>
      </Modal>

      <Modal visible={editingContacts} animationType="slide" onRequestClose={() => setEditingContacts(false)}>
        <View style={[styles.modalRoot, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.modalTitle}>Priority contacts</Text>
          {contactsLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ScrollView style={styles.modalScroll}>
              {allContacts.slice(0, 200).map((c) => {
                const id = c.recordID;
                const label =
                  [c.givenName, c.familyName].filter(Boolean).join(' ') ||
                  c.phoneNumbers[0]?.number ||
                  'Unknown';
                const on = selectedContactIds.has(id);
                return (
                  <Pressable
                    key={id}
                    style={styles.contactRow}
                    onPress={() => {
                      setSelectedContactIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                  >
                    <Text style={styles.contactName}>{label}</Text>
                    <Text style={styles.contactCheck}>{on ? '✓' : ''}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Pressable
            style={styles.modalPrimary}
            onPress={async () => {
              await prefs.setPriorityContactIds([...selectedContactIds]);
              setEditingContacts(false);
            }}
          >
            <Text style={styles.modalPrimaryText}>Save</Text>
          </Pressable>
          <Pressable style={styles.modalClose} onPress={() => setEditingContacts(false)}>
            <Text style={styles.modalCloseText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#0A0A0C', flex: 1 },
  eyebrow: {
    color: '#5C5C66',
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 1.47,
    textTransform: 'uppercase',
  },
  title: {
    color: '#F5F5F7',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
    lineHeight: 32,
    marginTop: 8,
  },
  titleLight: { color: '#9A9AA2', fontWeight: '200' },
  groupHd: {
    color: '#5C5C66',
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 1.47,
    marginBottom: 10,
    marginTop: 26,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowBorder: { borderBottomColor: '#222228', borderBottomWidth: 1 },
  setIcon: {
    alignItems: 'center',
    backgroundColor: '#18181D',
    borderColor: '#2E2E36',
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  setIconRound: { borderRadius: 15 },
  setIconSquare: { borderRadius: 9 },
  setIconInner: { borderWidth: 1.5, height: 12, width: 12 },
  setIconInnerRound: { borderRadius: 6 },
  rowTxt: { flex: 1 },
  rowName: { color: '#F5F5F7', fontSize: 13.5, fontWeight: '500' },
  rowSub: { color: '#5C5C66', fontSize: 11, fontWeight: '300', marginTop: 2 },
  codeValue: {
    color: '#F5F5F7',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 4,
  },
  codeHint: {
    color: '#5C5C66',
    fontSize: 11,
    fontWeight: '300',
    lineHeight: 17,
    marginTop: 6,
  },
  chev: { color: '#5C5C66', fontSize: 18 },
  modalRoot: { backgroundColor: '#0A0A0C', flex: 1, paddingHorizontal: 28 },
  modalTitle: { color: '#F5F5F7', fontSize: 24, fontWeight: '700', marginBottom: 8 },
  modalSub: { color: '#9A9AA2', fontSize: 14, lineHeight: 22, marginBottom: 20 },
  modalScroll: { flex: 1, marginTop: 12 },
  modalPrimary: {
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalPrimaryText: { color: '#0A0A0C', fontWeight: '600' },
  modalSecondary: {
    alignItems: 'center',
    borderColor: '#2E2E36',
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: 10,
  },
  modalSecondaryText: { color: '#9A9AA2', fontSize: 14 },
  modalClose: { alignItems: 'center', height: 44, justifyContent: 'center', marginTop: 8 },
  modalCloseText: { color: '#9A9AA2', fontSize: 14, fontWeight: '500' },
  fieldLabel: { color: '#5C5C66', fontSize: 11, marginBottom: 6, marginTop: 12 },
  fieldValue: { color: '#F5F5F7', fontSize: 14, marginBottom: 8 },
  input: {
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 12,
    borderWidth: 1,
    color: '#F5F5F7',
    height: 44,
    marginBottom: 10,
    paddingHorizontal: 14,
  },
  contactRow: {
    borderBottomColor: '#222228',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingVertical: 12,
  },
  contactName: { color: '#F5F5F7', flex: 1 },
  contactCheck: { color: '#E8C56A' },
});
