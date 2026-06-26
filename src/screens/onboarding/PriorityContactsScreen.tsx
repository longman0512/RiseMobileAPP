import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import Contacts from 'react-native-contacts';
import type { Contact } from 'react-native-contacts';

import type { OnboardingStackParamList } from '../../navigation/onboarding/OnboardingNavigator';
import { requestContactsPermission } from '../../lib/permissions';
import { useCoins } from '../../providers/CoinsProvider';
import { useOnboardingState } from '../../providers/OnboardingStateProvider';
import { useUserPreferences } from '../../providers/UserPreferencesProvider';

function contactKey(c: Contact): string {
  return c.recordID;
}

function contactLabel(c: Contact): string {
  const name = [c.givenName, c.familyName].filter(Boolean).join(' ').trim();
  const phone = c.phoneNumbers[0]?.number;
  if (name && phone) return `${name} · ${phone}`;
  return name || phone || 'Unknown';
}

export function PriorityContactsScreen() {
  const onboarding = useOnboardingState();
  const { dismissCoinOnboarding } = useCoins();
  const { priorityContactIds, setPriorityContactIds } = useUserPreferences();

  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(priorityContactIds));
  const [query, setQuery] = useState('');

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setPermissionDenied(false);
    try {
      const granted = await requestContactsPermission();
      if (!granted) {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }

      const list = await Contacts.getAll();
      list.sort((a, b) => contactLabel(a).localeCompare(contactLabel(b)));
      setContacts(list);
    } catch {
      setPermissionDenied(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => contactLabel(c).toLowerCase().includes(q));
  }, [contacts, query]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const finishOnboarding = async (ids: string[]) => {
    await setPriorityContactIds(ids);
    await dismissCoinOnboarding();
    await onboarding.markComplete();
  };

  const onContinue = () => {
    void finishOnboarding([...selected]);
  };

  const onSkip = () => {
    void finishOnboarding([]);
  };

  return (
    <View className="flex-1 bg-[#0A0A0C] px-6 pt-10">
      <Text className="text-white text-3xl font-bold text-center">Priority contacts</Text>
      <Text className="text-zinc-400 text-center mt-3 text-sm leading-5 px-2">
        During FLOW, only people you choose can reach you (when Focus Mode is configured).
      </Text>

      <TextInput
        className="mt-6 h-11 rounded-xl border border-white/10 bg-zinc-900/80 px-4 text-white"
        placeholder="Search contacts"
        placeholderTextColor="#52525b"
        value={query}
        onChangeText={setQuery}
      />

      {loading ? (
        <ActivityIndicator className="mt-12" color="#fff" />
      ) : permissionDenied ? (
        <View className="mt-8">
          <Text className="text-zinc-500 text-center text-sm">
            Contacts access was not granted. You can add priority contacts later in Settings.
          </Text>
          <Pressable
            className="mt-4 h-11 rounded-xl border border-white/20 items-center justify-center"
            onPress={() => void loadContacts()}
          >
            <Text className="text-white">Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          className="mt-4 flex-1"
          data={filtered}
          keyExtractor={contactKey}
          renderItem={({ item }) => {
            const id = contactKey(item);
            const isOn = selected.has(id);
            return (
              <Pressable
                onPress={() => toggle(id)}
                className="py-3 border-b border-white/5 flex-row items-center justify-between"
              >
                <Text className="text-white flex-1 pr-2" numberOfLines={1}>
                  {contactLabel(item)}
                </Text>
                <View
                  className={[
                    'w-5 h-5 rounded border items-center justify-center',
                    isOn ? 'bg-white border-white' : 'border-zinc-600',
                  ].join(' ')}
                >
                  {isOn ? <Text className="text-black text-xs font-bold">✓</Text> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <View className="pb-10 pt-3 gap-3">
        <Text className="text-zinc-600 text-center text-xs">
          {selected.size} selected
        </Text>
        <Pressable className="h-12 rounded-xl bg-white items-center justify-center" onPress={onContinue}>
          <Text className="text-black font-semibold">Continue</Text>
        </Pressable>
        <Pressable className="h-12 items-center justify-center" onPress={onSkip}>
          <Text className="text-zinc-400">Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}
