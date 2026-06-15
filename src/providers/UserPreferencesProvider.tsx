import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MusicService = 'spotify' | 'apple' | 'none';

const KEYS = {
  musicService: 'rise.musicService',
  priorityContactIds: 'rise.priorityContactIds',
  focusSetupComplete: 'rise.focusSetupComplete',
} as const;

type UserPreferencesContextValue = {
  loading: boolean;
  musicService: MusicService;
  priorityContactIds: string[];
  focusSetupComplete: boolean;
  setMusicService: (service: MusicService) => Promise<void>;
  setPriorityContactIds: (ids: string[]) => Promise<void>;
  setFocusSetupComplete: (complete: boolean) => Promise<void>;
};

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

function parseMusicService(value: string | null): MusicService {
  if (value === 'spotify' || value === 'apple' || value === 'none') return value;
  return 'none';
}

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [musicService, setMusicServiceState] = useState<MusicService>('none');
  const [priorityContactIds, setPriorityContactIdsState] = useState<string[]>([]);
  const [focusSetupComplete, setFocusSetupCompleteState] = useState(false);

  const refresh = useCallback(async () => {
    const [music, contacts, focus] = await Promise.all([
      AsyncStorage.getItem(KEYS.musicService),
      AsyncStorage.getItem(KEYS.priorityContactIds),
      AsyncStorage.getItem(KEYS.focusSetupComplete),
    ]);
    setMusicServiceState(parseMusicService(music));
    try {
      setPriorityContactIdsState(contacts ? (JSON.parse(contacts) as string[]) : []);
    } catch {
      setPriorityContactIdsState([]);
    }
    setFocusSetupCompleteState(focus === 'true');
    setHydrated(true);
  }, []);

  useEffect(() => {
    refresh().catch(() => setHydrated(true));
  }, [refresh]);

  const setMusicService = useCallback(async (service: MusicService) => {
    await AsyncStorage.setItem(KEYS.musicService, service);
    setMusicServiceState(service);
  }, []);

  const setPriorityContactIds = useCallback(async (ids: string[]) => {
    await AsyncStorage.setItem(KEYS.priorityContactIds, JSON.stringify(ids));
    setPriorityContactIdsState(ids);
  }, []);

  const setFocusSetupComplete = useCallback(async (complete: boolean) => {
    await AsyncStorage.setItem(KEYS.focusSetupComplete, complete ? 'true' : 'false');
    setFocusSetupCompleteState(complete);
  }, []);

  const value = useMemo<UserPreferencesContextValue>(
    () => ({
      loading: !hydrated,
      musicService,
      priorityContactIds,
      focusSetupComplete,
      setMusicService,
      setPriorityContactIds,
      setFocusSetupComplete,
    }),
    [
      hydrated,
      musicService,
      priorityContactIds,
      focusSetupComplete,
      setMusicService,
      setPriorityContactIds,
      setFocusSetupComplete,
    ],
  );

  return (
    <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) {
    throw new Error('useUserPreferences must be used within UserPreferencesProvider');
  }
  return ctx;
}
