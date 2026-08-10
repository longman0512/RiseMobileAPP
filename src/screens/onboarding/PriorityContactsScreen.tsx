import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Contacts from 'react-native-contacts';
import type { Contact } from 'react-native-contacts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isContactsPermissionBlocked, requestContactsPermission } from '../../lib/permissions';
import { useCoins } from '../../providers/CoinsProvider';
import { useOnboardingState } from '../../providers/OnboardingStateProvider';
import { useUserPreferences } from '../../providers/UserPreferencesProvider';
import { onboardingStyles, setupEyebrow } from './onboardingLayout';

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
  const insets = useSafeAreaInsets();
  const onboarding = useOnboardingState();
  const { dismissCoinOnboarding } = useCoins();
  const { priorityContactIds, setPriorityContactIds } = useUserPreferences();

  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  // True when contacts access is permanently blocked (iOS won't re-prompt) —
  // the only recovery is the system Settings app.
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(priorityContactIds));
  const [query, setQuery] = useState('');

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setPermissionDenied(false);
    setPermissionBlocked(false);
    try {
      const granted = await requestContactsPermission();
      if (!granted) {
        setPermissionDenied(true);
        setPermissionBlocked(await isContactsPermissionBlocked());
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

  // When access is blocked, the user must grant it in system Settings. Retry
  // automatically when they return to the app so the list loads without a manual tap.
  const permissionBlockedRef = useRef(permissionBlocked);
  permissionBlockedRef.current = permissionBlocked;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && permissionBlockedRef.current) {
        void loadContacts();
      }
    });
    return () => sub.remove();
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
    <View style={onboardingStyles.root}>
      <View style={[styles.content, { paddingTop: insets.top + 18 }]}>
        <View style={onboardingStyles.hero}>
          <Text style={onboardingStyles.eyebrow}>{setupEyebrow(3)}</Text>
          <Text style={onboardingStyles.title}>
            Priority{'\n'}
            <Text style={onboardingStyles.titleLight}>contacts.</Text>
          </Text>
          <Text style={onboardingStyles.subtitle}>
            During FLOW, only people you choose can reach you (when Focus Mode is configured).
          </Text>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts"
          placeholderTextColor="#5C5C66"
          value={query}
          onChangeText={setQuery}
        />

        {loading ? (
          <ActivityIndicator color="#F5F5F7" style={styles.loader} />
        ) : permissionDenied ? (
          <View style={styles.deniedWrap}>
            <Text style={styles.deniedText}>
              {permissionBlocked
                ? 'Contacts access is turned off. Enable it in Settings to choose priority contacts, or add them later.'
                : 'Contacts access was not granted. You can add priority contacts later in Settings.'}
            </Text>
            <Pressable
              style={styles.retryButton}
              onPress={() =>
                permissionBlocked ? void Linking.openSettings() : void loadContacts()
              }
            >
              <Text style={styles.retryText}>
                {permissionBlocked ? 'Open Settings' : 'Try again'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={filtered}
            keyExtractor={contactKey}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const id = contactKey(item);
              const isOn = selected.has(id);
              return (
                <Pressable onPress={() => toggle(id)} style={styles.contactRow}>
                  <Text style={styles.contactLabel} numberOfLines={1}>
                    {contactLabel(item)}
                  </Text>
                  <View style={[styles.checkBox, isOn ? styles.checkBoxOn : null]}>
                    {isOn ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      <View style={onboardingStyles.footer}>
        <Text style={styles.selectedCount}>{selected.size} selected</Text>
        <Pressable style={onboardingStyles.continueButton} onPress={onContinue}>
          <Text style={onboardingStyles.continueText}>Continue</Text>
        </Pressable>
        <Pressable style={onboardingStyles.skipButton} onPress={onSkip}>
          <Text style={onboardingStyles.skipText}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  searchInput: {
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 12,
    borderWidth: 1,
    color: '#F5F5F7',
    fontSize: 14,
    height: 44,
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  loader: {
    marginTop: 24,
  },
  deniedWrap: {
    marginTop: 16,
  },
  deniedText: {
    color: '#9A9AA2',
    fontSize: 13,
    fontWeight: '300',
    lineHeight: 20,
    textAlign: 'left',
  },
  retryButton: {
    alignItems: 'center',
    borderColor: '#2E2E36',
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginTop: 12,
  },
  retryText: {
    color: '#F5F5F7',
    fontSize: 14,
    fontWeight: '500',
  },
  list: {
    flex: 1,
  },
  contactRow: {
    alignItems: 'center',
    borderBottomColor: '#222228',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  contactLabel: {
    color: '#F5F5F7',
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    paddingRight: 12,
  },
  checkBox: {
    alignItems: 'center',
    borderColor: '#5C5C66',
    borderRadius: 4,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  checkBoxOn: {
    backgroundColor: '#F5F5F7',
    borderColor: '#F5F5F7',
  },
  checkMark: {
    color: '#0A0A0C',
    fontSize: 11,
    fontWeight: '700',
  },
  selectedCount: {
    color: '#5C5C66',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4,
    textAlign: 'left',
  },
});
