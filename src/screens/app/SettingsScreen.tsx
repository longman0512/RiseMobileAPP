import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setNfcBusy, startNfcListener } from '../../lib/nfc';
import { supabase } from '../../lib/supabase';
import { openFocusSettings } from '../../lib/focusSettings';
import { openFlowPlaylist } from '../../lib/flowMusic';
import { requestContactsPermission } from '../../lib/permissions';
import { useAuth } from '../../providers/AuthProvider';
import { useCoins } from '../../providers/CoinsProvider';
import { useUserPreferences, type MusicService } from '../../providers/UserPreferencesProvider';
import { COIN_LABELS, COIN_TYPES, type CoinType } from '../../types/coins';
import Contacts from 'react-native-contacts';
import type { Contact } from 'react-native-contacts';

type RegisterState =
  | { status: 'idle' }
  | { status: 'listening'; coinType: CoinType }
  | { status: 'registering'; coinType: CoinType };

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { session, refreshProfile } = useAuth();
  const { coins, registerCoin, refresh: refreshCoins } = useCoins();
  const {
    musicService,
    setMusicService,
    priorityContactIds,
    setPriorityContactIds,
  } = useUserPreferences();

  const [editingContacts, setEditingContacts] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(
    () => new Set(priorityContactIds),
  );

  const email = session?.user?.email ?? '';
  const initialUsername = (session?.user?.user_metadata?.username as string | undefined) ?? '';

  const [username, setUsername] = useState(initialUsername);
  const [savingUsername, setSavingUsername] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [registerState, setRegisterState] = useState<RegisterState>({ status: 'idle' });
  const stopNfcRef = useRef<(() => void) | null>(null);
  const handlingTagRef = useRef(false);

  useEffect(() => {
    setUsername(initialUsername);
  }, [initialUsername]);

  const coinByType = useMemo(() => {
    const map = new Map<CoinType, string[]>();
    for (const type of COIN_TYPES) map.set(type, []);
    for (const c of coins) {
      if (!c.active) continue;
      map.get(c.coin_type)?.push(c.coin_id);
    }
    return map;
  }, [coins]);

  const onSaveUsername = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      Alert.alert('Not signed in', 'Please sign in again.');
      return;
    }

    const clean = username.trim();
    if (clean.length < 3) {
      Alert.alert('Username too short', 'Please use at least 3 characters.');
      return;
    }

    setSavingUsername(true);
    try {
      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: userId,
        username: clean,
      });
      if (upsertError) {
        Alert.alert('Failed', upsertError.message);
        return;
      }

      const { error: metaError } = await supabase.auth.updateUser({ data: { username: clean } });
      if (metaError) {
        Alert.alert('Saved, but…', metaError.message);
        return;
      }

      await refreshProfile();
      Alert.alert('Saved', 'Your username was updated.');
    } catch {
      Alert.alert('Failed', 'Unexpected error. Please try again.');
    } finally {
      setSavingUsername(false);
    }
  }, [refreshProfile, session?.user?.id, username]);

  const onChangePassword = useCallback(async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      Alert.alert('Unavailable', 'No email found for this account.');
      return;
    }
    if (currentPassword.length === 0 || newPassword.length < 8) {
      Alert.alert('Invalid', 'Enter your current password and a new password (min 8 characters).');
      return;
    }

    setChangingPassword(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: currentPassword,
      });
      if (verifyError) {
        Alert.alert('Current password is incorrect', verifyError.message);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        Alert.alert('Failed', updateError.message);
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      Alert.alert('Updated', 'Your password has been changed.');
    } catch {
      Alert.alert('Failed', 'Unexpected error. Please try again.');
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, email, newPassword]);

  const stopListening = useCallback(async () => {
    const stop = stopNfcRef.current;
    stopNfcRef.current = null;
    handlingTagRef.current = false;
    setRegisterState({ status: 'idle' });
    if (stop) {
      try {
        await stop();
      } catch {
        // ignore
      }
    }
    // Release the global NFC lock so the live coin-tap listener can resume.
    setNfcBusy(false);
  }, []);

  const beginRegister = useCallback(
    async (coinType: CoinType) => {
      await stopListening();
      setRegisterState({ status: 'listening', coinType });
      // Hold the global NFC lock so the live coin-tap listener stands down.
      setNfcBusy(true);
      try {
        const stop = await startNfcListener((coinId) => {
          if (handlingTagRef.current) return;
          handlingTagRef.current = true;
          setRegisterState({ status: 'registering', coinType });
          registerCoin(coinId, coinType)
            .then(async (result) => {
              if (!result.ok) {
                Alert.alert('Registration failed', result.message);
                return;
              }
              Alert.alert('Registered', `${COIN_LABELS[coinType]} coin linked to your account.`);
              await refreshCoins();
              await stopListening();
            })
            .catch(() => {
              Alert.alert('Registration failed', 'Unexpected error. Please try again.');
            })
            .finally(() => {
              handlingTagRef.current = false;
              setRegisterState((prev) => (prev.status === 'idle' ? prev : { status: 'idle' }));
            });
        });

        stopNfcRef.current = stop;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'NFC is unavailable.';
        Alert.alert('NFC', message);
        await stopListening();
      }
    },
    [registerCoin, refreshCoins, stopListening],
  );

  useEffect(() => {
    return () => {
      void stopListening();
    };
  }, [stopListening]);

  const canSaveUsername = useMemo(() => username.trim().length >= 3 && !savingUsername, [savingUsername, username]);
  const canChangePassword = useMemo(
    () => currentPassword.length > 0 && newPassword.length >= 8 && !changingPassword,
    [changingPassword, currentPassword.length, newPassword.length],
  );

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 96,
          paddingHorizontal: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-white text-2xl font-semibold mb-6">Settings</Text>

        <View className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
          <Text className="text-white text-base font-semibold mb-3">Profile</Text>
          <Text className="text-zinc-400 text-xs mb-2">Email</Text>
          <View className="h-12 rounded-xl bg-zinc-900/60 border border-white/10 px-4 justify-center">
            <Text className="text-zinc-300">{email || '—'}</Text>
          </View>

          <Text className="text-zinc-400 text-xs mb-2 mt-4">Username</Text>
          <TextInput
            className="h-12 rounded-xl bg-zinc-900/60 border border-white/10 px-4 text-white"
            value={username}
            onChangeText={setUsername}
            placeholder="winterstory"
            placeholderTextColor="#71717a"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            className={[
              'mt-4 h-12 rounded-xl items-center justify-center',
              canSaveUsername ? 'bg-white' : 'bg-zinc-700',
            ].join(' ')}
            onPress={onSaveUsername}
            disabled={!canSaveUsername}
          >
            <Text className={canSaveUsername ? 'text-black font-semibold' : 'text-zinc-200 font-semibold'}>
              {savingUsername ? 'Saving…' : 'Save username'}
            </Text>
          </Pressable>
        </View>

        <View className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 mt-4">
          <Text className="text-white text-base font-semibold mb-3">Security</Text>

          <Text className="text-zinc-400 text-xs mb-2">Current password</Text>
          <TextInput
            className="h-12 rounded-xl bg-zinc-900/60 border border-white/10 px-4 text-white"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="••••••••"
            placeholderTextColor="#71717a"
            secureTextEntry
          />

          <Text className="text-zinc-400 text-xs mb-2 mt-4">New password</Text>
          <TextInput
            className="h-12 rounded-xl bg-zinc-900/60 border border-white/10 px-4 text-white"
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Min 8 characters"
            placeholderTextColor="#71717a"
            secureTextEntry
          />

          <Pressable
            className={[
              'mt-4 h-12 rounded-xl items-center justify-center',
              canChangePassword ? 'bg-white' : 'bg-zinc-700',
            ].join(' ')}
            onPress={onChangePassword}
            disabled={!canChangePassword}
          >
            <Text className={canChangePassword ? 'text-black font-semibold' : 'text-zinc-200 font-semibold'}>
              {changingPassword ? 'Updating…' : 'Change password'}
            </Text>
          </Pressable>
        </View>

        <View className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 mt-4">
          <Text className="text-white text-base font-semibold mb-1">FLOW</Text>
          <Text className="text-zinc-400 text-xs mb-3">Music and priority contacts for FLOW sessions.</Text>

          <Text className="text-zinc-400 text-xs mb-2">Music service</Text>
          <View className="flex-row gap-2 mb-3">
            {(['spotify', 'apple', 'none'] as MusicService[]).map((id) => (
              <Pressable
                key={id}
                onPress={() => void setMusicService(id)}
                className={[
                  'flex-1 py-2 rounded-lg border items-center',
                  musicService === id ? 'border-white bg-white/10' : 'border-white/15',
                ].join(' ')}
              >
                <Text className="text-white text-xs font-medium capitalize">{id}</Text>
              </Pressable>
            ))}
          </View>
          {musicService !== 'none' ? (
            <Pressable
              className="h-10 rounded-xl border border-white/15 items-center justify-center mb-3"
              onPress={() => void openFlowPlaylist(musicService)}
            >
              <Text className="text-zinc-300 text-sm">Preview FLOW playlist</Text>
            </Pressable>
          ) : null}

          <Text className="text-zinc-400 text-xs mb-2">Priority contacts</Text>
          <Text className="text-zinc-500 text-sm mb-2">
            {priorityContactIds.length} selected
          </Text>
          <Pressable
            className="h-10 rounded-xl border border-white/15 items-center justify-center mb-2"
            onPress={async () => {
              setEditingContacts(true);
              setSelectedContactIds(new Set(priorityContactIds));
              setContactsLoading(true);
              const granted = await requestContactsPermission();
              if (granted) {
                try {
                  const list = await Contacts.getAll();
                  setAllContacts(list);
                } catch {
                  Alert.alert('Contacts', 'Could not load contacts.');
                }
              } else {
                Alert.alert('Contacts', 'Permission required to select contacts.');
              }
              setContactsLoading(false);
            }}
          >
            <Text className="text-zinc-300 text-sm">Update priority contacts</Text>
          </Pressable>
          <Pressable
            className="h-10 rounded-xl border border-white/15 items-center justify-center"
            onPress={openFocusSettings}
          >
            <Text className="text-zinc-300 text-sm">Focus Mode settings</Text>
          </Pressable>
        </View>

        <View className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 mt-4">
          <Text className="text-white text-base font-semibold mb-1">Coins</Text>
          <Text className="text-zinc-400 text-xs mb-4">
            Re-register coins by tapping them on the back of your phone.
          </Text>

          <View className="gap-3">
            {COIN_TYPES.map((type) => {
              const ids = coinByType.get(type) ?? [];
              const registered = ids.length > 0;
              const label = COIN_LABELS[type];
              const actionLabel = registered ? 'Re-register' : 'Register';
              return (
                <View key={type} className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-white font-semibold">{label}</Text>
                      <Text className="text-zinc-400 text-xs mt-1">
                        {registered ? `Registered (${ids.length})` : 'Not registered'}
                      </Text>
                    </View>
                    <Pressable
                      className="h-10 px-4 rounded-xl bg-white items-center justify-center"
                      onPress={() => void beginRegister(type)}
                      disabled={registerState.status !== 'idle'}
                    >
                      <Text className="text-black font-semibold text-sm">{actionLabel}</Text>
                    </Pressable>
                  </View>

                  {registered ? (
                    <View className="mt-3 gap-1">
                      {ids.slice(0, 3).map((id) => (
                        <Text key={id} className="text-zinc-500 text-xs">
                          {id}
                        </Text>
                      ))}
                      {ids.length > 3 ? (
                        <Text className="text-zinc-500 text-xs">+{ids.length - 3} more</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {editingContacts ? (
        <View className="absolute inset-0 bg-black/90 px-4 pt-14 pb-8">
          <Text className="text-white text-xl font-bold text-center mb-4">Priority contacts</Text>
          {contactsLoading ? (
            <ActivityIndicator color="#fff" className="mt-8" />
          ) : (
            <ScrollView className="flex-1">
              {allContacts.slice(0, 200).map((c) => {
                const id = c.recordID;
                const label = [c.givenName, c.familyName].filter(Boolean).join(' ') || c.phoneNumbers[0]?.number || 'Unknown';
                const on = selectedContactIds.has(id);
                return (
                  <Pressable
                    key={id}
                    onPress={() => {
                      setSelectedContactIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                    className="py-3 border-b border-white/5 flex-row justify-between items-center"
                  >
                    <Text className="text-white flex-1" numberOfLines={1}>{label}</Text>
                    <Text className="text-zinc-500">{on ? '✓' : ''}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Pressable
            className="mt-4 h-12 rounded-xl bg-white items-center justify-center"
            onPress={async () => {
              await setPriorityContactIds([...selectedContactIds]);
              setEditingContacts(false);
            }}
          >
            <Text className="text-black font-semibold">Save</Text>
          </Pressable>
          <Pressable className="mt-2 h-12 items-center justify-center" onPress={() => setEditingContacts(false)}>
            <Text className="text-zinc-400">Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      {registerState.status !== 'idle' ? (
        <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
          <View className="w-[86%] rounded-2xl border border-white/10 bg-zinc-950 p-5">
            <Text className="text-white text-lg font-semibold text-center">
              {registerState.status === 'registering' ? 'Registering…' : 'Ready to scan'}
            </Text>
            <Text className="text-zinc-400 text-center mt-2 leading-5">
              Tap your {COIN_LABELS[registerState.coinType]} coin on the back of your phone.
            </Text>
            <View className="items-center mt-5">
              {registerState.status === 'registering' ? (
                <ActivityIndicator size="large" color="#ffffff" />
              ) : (
                <View className="h-16 w-16 rounded-full border-2 border-dashed border-white/30 items-center justify-center">
                  <Text className="text-white/50 text-xs text-center px-2">NFC</Text>
                </View>
              )}
            </View>

            <Pressable className="mt-6 h-12 rounded-xl bg-white items-center justify-center" onPress={() => void stopListening()}>
              <Text className="text-black font-semibold">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

