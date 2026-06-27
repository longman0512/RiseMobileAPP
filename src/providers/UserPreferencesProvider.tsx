import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MusicService = 'spotify' | 'apple' | 'none';

const KEYS = {
  musicService: 'rise.musicService',
  priorityContactIds: 'rise.priorityContactIds',
  focusSetupComplete: 'rise.focusSetupComplete',
  backgroundTapEnabled: 'rise.backgroundTapEnabled',
  soundsHapticsEnabled: 'rise.soundsHapticsEnabled',
  liveActivityEnabled: 'rise.liveActivityEnabled',
} as const;

type UserPreferencesContextValue = {
  loading: boolean;
  musicService: MusicService;
  priorityContactIds: string[];
  focusSetupComplete: boolean;
  backgroundTapEnabled: boolean;
  soundsHapticsEnabled: boolean;
  liveActivityEnabled: boolean;
  setMusicService: (service: MusicService) => Promise<void>;
  setPriorityContactIds: (ids: string[]) => Promise<void>;
  setFocusSetupComplete: (complete: boolean) => Promise<void>;
  setBackgroundTapEnabled: (enabled: boolean) => Promise<void>;
  setSoundsHapticsEnabled: (enabled: boolean) => Promise<void>;
  setLiveActivityEnabled: (enabled: boolean) => Promise<void>;
};

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

function parseMusicService(value: string | null): MusicService {
  if (value === 'spotify' || value === 'apple' || value === 'none') return value;
  return 'none';
}

function parseBool(value: string | null, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  return value === 'true';
}

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [musicService, setMusicServiceState] = useState<MusicService>('none');
  const [priorityContactIds, setPriorityContactIdsState] = useState<string[]>([]);
  const [focusSetupComplete, setFocusSetupCompleteState] = useState(false);
  const [backgroundTapEnabled, setBackgroundTapEnabledState] = useState(true);
  const [soundsHapticsEnabled, setSoundsHapticsEnabledState] = useState(true);
  const [liveActivityEnabled, setLiveActivityEnabledState] = useState(true);

  const refresh = useCallback(async () => {
    const [music, contacts, focus, bgTap, sounds, liveActivity] = await Promise.all([
      AsyncStorage.getItem(KEYS.musicService),
      AsyncStorage.getItem(KEYS.priorityContactIds),
      AsyncStorage.getItem(KEYS.focusSetupComplete),
      AsyncStorage.getItem(KEYS.backgroundTapEnabled),
      AsyncStorage.getItem(KEYS.soundsHapticsEnabled),
      AsyncStorage.getItem(KEYS.liveActivityEnabled),
    ]);
    setMusicServiceState(parseMusicService(music));
    try {
      setPriorityContactIdsState(contacts ? (JSON.parse(contacts) as string[]) : []);
    } catch {
      setPriorityContactIdsState([]);
    }
    setFocusSetupCompleteState(focus === 'true');
    setBackgroundTapEnabledState(parseBool(bgTap, true));
    setSoundsHapticsEnabledState(parseBool(sounds, true));
    setLiveActivityEnabledState(parseBool(liveActivity, true));
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

  const setBackgroundTapEnabled = useCallback(async (enabled: boolean) => {
    await AsyncStorage.setItem(KEYS.backgroundTapEnabled, enabled ? 'true' : 'false');
    setBackgroundTapEnabledState(enabled);
  }, []);

  const setSoundsHapticsEnabled = useCallback(async (enabled: boolean) => {
    await AsyncStorage.setItem(KEYS.soundsHapticsEnabled, enabled ? 'true' : 'false');
    setSoundsHapticsEnabledState(enabled);
  }, []);

  const setLiveActivityEnabled = useCallback(async (enabled: boolean) => {
    await AsyncStorage.setItem(KEYS.liveActivityEnabled, enabled ? 'true' : 'false');
    setLiveActivityEnabledState(enabled);
  }, []);

  const value = useMemo<UserPreferencesContextValue>(
    () => ({
      loading: !hydrated,
      musicService,
      priorityContactIds,
      focusSetupComplete,
      backgroundTapEnabled,
      soundsHapticsEnabled,
      liveActivityEnabled,
      setMusicService,
      setPriorityContactIds,
      setFocusSetupComplete,
      setBackgroundTapEnabled,
      setSoundsHapticsEnabled,
      setLiveActivityEnabled,
    }),
    [
      hydrated,
      musicService,
      priorityContactIds,
      focusSetupComplete,
      backgroundTapEnabled,
      soundsHapticsEnabled,
      liveActivityEnabled,
      setMusicService,
      setPriorityContactIds,
      setFocusSetupComplete,
      setBackgroundTapEnabled,
      setSoundsHapticsEnabled,
      setLiveActivityEnabled,
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
