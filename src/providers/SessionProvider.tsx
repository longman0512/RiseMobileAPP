import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, type AppStateStatus, Vibration } from 'react-native';

import { SessionResumeOverlay } from '../components/SessionResumeOverlay';
import { activateFocusModeOnSessionStart } from '../lib/focusMode';
import {
  enqueueOfflineSessionJob,
  flushOfflineSessionQueue,
  shouldQueueSessionError,
} from '../lib/offlineSessionQueue';
import { navigateProtocolStack, resetToApp } from '../lib/navigationRef';
import { showSuccessToast } from '../lib/toast';
import {
  PROTOCOL_CONFIG,
  RESET_INSTRUCTIONS,
  RESET_INSTRUCTION_ROTATE_MS,
} from '../lib/protocolConfig';
import { openFlowPlaylist } from '../lib/flowMusic';
import {
  endSession,
  resolveSessionSave,
  sumFocusMinutes,
  sumRecoveryMinutes,
  sumSegmentMinutes,
  updateSessionNotes,
  type SessionSegment,
} from '../lib/sessionApi';
import { useAuth } from './AuthProvider';
import { useCoins } from './CoinsProvider';
import { useUserPreferences } from './UserPreferencesProvider';
import type { CoinType } from '../types/coins';

export type SessionPhase =
  | 'idle'
  | 'prestart'
  | 'active'
  | 'overtime'
  | 'summary'
  | 'journal';

export type SessionSummary = {
  protocol: CoinType;
  plannedMinutes: number;
  actualMinutes: number;
  focusMinutes: number;
  recoveryMinutes: number;
  overtimeMinutes: number;
  segments: SessionSegment[];
  streak: number | null;
};

function segmentElapsedSeconds(
  plannedMins: number,
  timeRemainingSeconds: number,
  overtimeSeconds: number,
): number {
  return Math.max(0, plannedMins * 60 - timeRemainingSeconds + overtimeSeconds);
}

function elapsedSecondsToMinutes(elapsedSeconds: number): number {
  return Math.max(1, Math.ceil(elapsedSeconds / 60));
}

type SessionContextValue = {
  phase: SessionPhase;
  activeProtocol: CoinType | null;
  plannedMinutes: number;
  timeRemainingSeconds: number;
  overtimeSeconds: number;
  flowThought: string;
  resetInstruction: string;
  summary: SessionSummary | null;
  journalNote: string;
  journalNextBlock: string;
  resumeFlowPrompt: boolean;
  pendingFlowResumeSeconds: number | null;
  pausedFlowRemainingSeconds: number | null;
  isSavingSession: boolean;
  setPlannedMinutes: (minutes: number) => void;
  setFlowThought: (text: string) => void;
  setJournalNote: (text: string) => void;
  setJournalNextBlock: (text: string) => void;
  beginSession: (plannedMinutesOverride?: number) => void;
  endSessionEarly: () => void;
  finishSummary: () => Promise<void>;
  skipJournal: () => Promise<void>;
  saveJournal: () => Promise<void>;
  extendFlowTwentyMinutes: () => void;
  dismissResumeFlowPrompt: () => void;
  handleProtocolTrigger: (protocol: CoinType, options?: { hasRegisteredCoin?: boolean }) => void;
  isSessionBlocking: () => boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

let pendingProtocol: CoinType | null = null;

export function consumePendingProtocol(): CoinType | null {
  const p = pendingProtocol;
  pendingProtocol = null;
  return p;
}

export function queuePendingProtocol(protocol: CoinType): void {
  pendingProtocol = protocol;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { session, phase: authPhase } = useAuth();
  const { coins } = useCoins();
  const { musicService } = useUserPreferences();

  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('idle');
  const [activeProtocol, setActiveProtocol] = useState<CoinType | null>(null);
  const [plannedMinutes, setPlannedMinutes] = useState(30);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(0);
  const [overtimeSeconds, setOvertimeSeconds] = useState(0);
  const [flowThought, setFlowThought] = useState('');
  const [resetInstructionIndex, setResetInstructionIndex] = useState(0);
  const [segments, setSegments] = useState<SessionSegment[]>([]);
  const [pausedFlowRemainingSeconds, setPausedFlowRemainingSeconds] = useState<number | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [journalNote, setJournalNote] = useState('');
  const [journalNextBlock, setJournalNextBlock] = useState('');
  const [resumeFlowPrompt, setResumeFlowPrompt] = useState(false);
  const [pendingFlowResumeDisplay, setPendingFlowResumeDisplay] = useState<number | null>(null);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [showResumeOverlay, setShowResumeOverlay] = useState(false);

  const RESUME_OVERLAY_MIN_BACKGROUND_MS = 1500;

  const pendingFlowResumeSecondsRef = useRef<number | null>(null);
  const segmentStartedAt = useRef<string | null>(null);
  const sessionStartedAt = useRef<string | null>(null);
  const sessionPrimaryCoinRef = useRef<CoinType | null>(null);
  const lastHapticAt = useRef<number>(0);
  const savingRef = useRef(false);
  const lastPersistedSessionId = useRef<string | null>(null);
  const pendingPersistRef = useRef<Promise<{
    ok: boolean;
    sessionId?: string;
    message?: string;
    queued?: boolean;
  }> | null>(null);

  const timeRemainingRef = useRef(0);
  const overtimeSecondsRef = useRef(0);
  const timerSnapshotRef = useRef<{
    phase: 'active' | 'overtime';
    timeRemainingSeconds: number;
    overtimeSeconds: number;
    wallMs: number;
  } | null>(null);
  const wentBackgroundAtRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    timeRemainingRef.current = timeRemainingSeconds;
  }, [timeRemainingSeconds]);

  useEffect(() => {
    overtimeSecondsRef.current = overtimeSeconds;
  }, [overtimeSeconds]);

  const hasCoinType = useCallback(
    (type: CoinType) => coins.some((c) => c.coin_type === type && c.active),
    [coins],
  );

  const openPreStart = useCallback((protocol: CoinType) => {
    const config = PROTOCOL_CONFIG[protocol];
    setActiveProtocol(protocol);
    setPlannedMinutes(config.defaultMinutes);
    setTimeRemainingSeconds(0);
    setOvertimeSeconds(0);
    setFlowThought('');
    setResetInstructionIndex(0);
    setSegments([]);
    setPausedFlowRemainingSeconds(null);
    setSummary(null);
    setJournalNote('');
    setJournalNextBlock('');
    setResumeFlowPrompt(false);
    pendingFlowResumeSecondsRef.current = null;
    setPendingFlowResumeDisplay(null);
    setSessionPhase('prestart');
    navigateProtocolStack('PreStart', { protocol });
  }, []);

  const persistInterimSegment = useCallback(
    async (protocol: CoinType, durationMins: number) => {
      if (authPhase !== 'signedIn' || savingRef.current) return;
      const started = segmentStartedAt.current ?? new Date().toISOString();
      const seg: SessionSegment = { protocol, duration_mins: durationMins };
      const payload = {
        coin_type: protocol,
        started_at: started,
        duration_mins: durationMins,
        note: null,
        next_block: null,
        segments: [seg],
      };
      const result = await endSession(payload);
      if (!result.ok && shouldQueueSessionError(result.message)) {
        await enqueueOfflineSessionJob({
          type: 'complete_session',
          payload,
          createdAt: new Date().toISOString(),
        });
      }
    },
    [authPhase],
  );

  const scheduleFlowResumeAfterJournal = useCallback(() => {
    const secs = pausedFlowRemainingSeconds;
    if (secs == null || secs < 1) return;
    pendingFlowResumeSecondsRef.current = secs;
    setPendingFlowResumeDisplay(secs);
    setResumeFlowPrompt(true);
    Alert.alert('Resume FLOW', 'Tap your FLOW coin to resume your session.');
  }, [pausedFlowRemainingSeconds]);

  const startActiveSegment = useCallback((protocol: CoinType, durationSeconds: number) => {
    const now = new Date().toISOString();
    if (!sessionStartedAt.current) sessionStartedAt.current = now;
    segmentStartedAt.current = now;
    const segmentPlannedMins = Math.max(1, Math.ceil(durationSeconds / 60));
    setActiveProtocol(protocol);
    setPlannedMinutes(segmentPlannedMins);
    setTimeRemainingSeconds(durationSeconds);
    setOvertimeSeconds(0);
    setSessionPhase('active');
    lastHapticAt.current = Date.now();
    if (protocol === 'reset') {
      setResetInstructionIndex(0);
    }
    navigateProtocolStack('Active', { protocol });
  }, []);

  const closeSegment = useCallback((protocol: CoinType, elapsedSeconds: number) => {
    const mins = elapsedSecondsToMinutes(elapsedSeconds);
    setSegments((prev) => [...prev, { protocol, duration_mins: mins }]);
  }, []);

  const handleProtocolTrigger = useCallback(
    (protocol: CoinType, options?: { hasRegisteredCoin?: boolean }) => {
      const registered = options?.hasRegisteredCoin ?? hasCoinType(protocol);

      if (authPhase !== 'signedIn') {
        queuePendingProtocol(protocol);
        return;
      }

      if (!registered) {
        Alert.alert('Register this coin', 'Register this coin in Settings before starting a session.');
        navigateProtocolStack('RegisterCoin', { protocol });
        return;
      }

      if (sessionPhase === 'idle') {
        const pending = pendingFlowResumeSecondsRef.current;
        if (protocol === 'flow' && pending != null && pending > 0) {
          pendingFlowResumeSecondsRef.current = null;
          setPendingFlowResumeDisplay(null);
          setResumeFlowPrompt(false);
          setPausedFlowRemainingSeconds(null);
          sessionPrimaryCoinRef.current = 'flow';
          setActiveProtocol('flow');
          startActiveSegment('flow', pending);
          return;
        }
        openPreStart(protocol);
        return;
      }

      if (sessionPhase === 'prestart') {
        openPreStart(protocol);
        return;
      }

      if (sessionPhase === 'active' || sessionPhase === 'overtime') {
        const current = activeProtocol;
        if (!current) return;

        if (current === 'lockin') return;

        if (current === 'flow') {
          if (protocol === 'lockin') return;
          if (protocol === 'reset') {
            const elapsed = segmentElapsedSeconds(
              plannedMinutes,
              timeRemainingSeconds,
              sessionPhase === 'overtime' ? overtimeSeconds : 0,
            );
            closeSegment('flow', Math.max(elapsed, 1));
            setPausedFlowRemainingSeconds(
              Math.max(1, timeRemainingSeconds + overtimeSeconds),
            );
            const resetSeconds = PROTOCOL_CONFIG.reset.defaultMinutes * 60;
            startActiveSegment('reset', resetSeconds);
          }
          return;
        }

        if (current === 'reset') {
          if (protocol === 'flow' && pausedFlowRemainingSeconds != null) {
            const elapsed = segmentElapsedSeconds(
              plannedMinutes,
              timeRemainingSeconds,
              overtimeSeconds,
            );
            closeSegment('reset', Math.max(elapsed, 1));
            startActiveSegment('flow', pausedFlowRemainingSeconds);
            setPausedFlowRemainingSeconds(null);
            return;
          }
          if (protocol === 'lockin') {
            const elapsed = segmentElapsedSeconds(
              plannedMinutes,
              timeRemainingSeconds,
              overtimeSeconds,
            );
            const resetMins = elapsedSecondsToMinutes(elapsed);
            closeSegment('reset', Math.max(elapsed, 1));
            setPausedFlowRemainingSeconds(null);
            pendingFlowResumeSecondsRef.current = null;
            setPendingFlowResumeDisplay(null);
            void persistInterimSegment('reset', resetMins);
            openPreStart('lockin');
          }
        }
      }
    },
    [
      activeProtocol,
      authPhase,
      closeSegment,
      hasCoinType,
      openPreStart,
      overtimeSeconds,
      pausedFlowRemainingSeconds,
      persistInterimSegment,
      plannedMinutes,
      sessionPhase,
      startActiveSegment,
      timeRemainingSeconds,
    ],
  );

  const beginSession = useCallback(
    (plannedMinutesOverride?: number) => {
      if (!activeProtocol) return;
      const mins = plannedMinutesOverride ?? plannedMinutes;
      setPlannedMinutes(mins);
      const seconds = mins * 60;
      sessionStartedAt.current = new Date().toISOString();
      sessionPrimaryCoinRef.current = activeProtocol;
      setSegments([]);
      timerSnapshotRef.current = null;
      startActiveSegment(activeProtocol, seconds);
      void activateFocusModeOnSessionStart(activeProtocol);
      if (activeProtocol === 'flow') {
        void openFlowPlaylist(musicService);
      }
    },
    [activeProtocol, musicService, plannedMinutes, startActiveSegment],
  );

  const persistSession = useCallback(
    async (
      finalProtocol: CoinType,
      note: string | null,
      nextBlock: string | null,
      durationMinsOverride?: number,
      segmentsOverride?: SessionSegment[],
    ): Promise<{ ok: boolean; sessionId?: string; message?: string; queued?: boolean }> => {
      if (authPhase !== 'signedIn') {
        return { ok: false, message: 'Not signed in' };
      }
      if (savingRef.current) {
        return { ok: false, message: 'Save already in progress' };
      }
      savingRef.current = true;
      setIsSavingSession(true);

      const started = sessionStartedAt.current ?? new Date().toISOString();
      const segs = segmentsOverride ?? segments;
      const planned = plannedMinutes;
      const legMins = elapsedSecondsToMinutes(
        planned * 60 -
          (sessionPhase === 'overtime' ? 0 : timeRemainingSeconds) +
          overtimeSeconds,
      );
      const saveMeta = resolveSessionSave(
        sessionPrimaryCoinRef.current,
        segs,
        finalProtocol,
        durationMinsOverride ??
          (segs.length > 0 ? Math.max(1, sumSegmentMinutes(segs)) : legMins),
      );

      const payload = {
        coin_type: saveMeta.coin_type,
        started_at: started,
        duration_mins: saveMeta.duration_mins,
        note,
        next_block: nextBlock,
        segments: saveMeta.segments,
      };

      try {
        const result = await endSession(payload);

        if (!result.ok && shouldQueueSessionError(result.message)) {
          await enqueueOfflineSessionJob({
            type: 'complete_session',
            payload,
            createdAt: new Date().toISOString(),
          });
          showSuccessToast('Saved locally', 'Will sync when you are back online.');
          return { ok: true, queued: true };
        }

        if (!result.ok) {
          Alert.alert('Could not save session', result.message ?? 'Unknown error');
        } else {
          if (result.sessionId) {
            lastPersistedSessionId.current = result.sessionId;
          }
          if (result.statsSkipped && result.message) {
            showSuccessToast('Session saved', result.message);
          }
        }

        return result;
      } finally {
        savingRef.current = false;
        setIsSavingSession(false);
      }
    },
    [authPhase, overtimeSeconds, plannedMinutes, segments, sessionPhase, timeRemainingSeconds],
  );

  const completeActiveSession = useCallback(() => {
    if (!activeProtocol) return;

    const elapsedActive = segmentElapsedSeconds(
      plannedMinutes,
      timeRemainingSeconds,
      sessionPhase === 'overtime' ? overtimeSeconds : 0,
    );
    const mins = elapsedSecondsToMinutes(elapsedActive);
    const nextSegments: SessionSegment[] = [
      ...segments,
      { protocol: activeProtocol, duration_mins: mins },
    ];
    const totalMinutes = Math.max(1, sumSegmentMinutes(nextSegments));
    const focusMinutes = sumFocusMinutes(nextSegments);
    const recoveryMinutes = sumRecoveryMinutes(nextSegments);
    const overtimeMinutes = Math.round(overtimeSeconds / 60);

    setSegments(nextSegments);
    setSummary({
      protocol: activeProtocol,
      plannedMinutes,
      actualMinutes: totalMinutes,
      focusMinutes,
      recoveryMinutes,
      overtimeMinutes,
      segments: nextSegments,
      streak: null,
    });

    const endScreen = PROTOCOL_CONFIG[activeProtocol].endScreen;
    if (endScreen === 'summary') {
      setSessionPhase('summary');
      navigateProtocolStack('Summary', { protocol: activeProtocol });
    } else {
      setSessionPhase('journal');
      navigateProtocolStack('Journal', { protocol: activeProtocol });
    }

    setPausedFlowRemainingSeconds(null);
    pendingFlowResumeSecondsRef.current = null;

    const persistPromise = persistSession(
      activeProtocol,
      null,
      null,
      focusMinutes,
      nextSegments,
    );
    pendingPersistRef.current = persistPromise;
    void persistPromise.finally(() => {
      if (pendingPersistRef.current === persistPromise) {
        pendingPersistRef.current = null;
      }
    });
  }, [
    activeProtocol,
    overtimeSeconds,
    persistSession,
    plannedMinutes,
    segments,
    sessionPhase,
    timeRemainingSeconds,
  ]);

  const endSessionEarly = useCallback(() => {
    completeActiveSession();
  }, [completeActiveSession]);

  const awaitPersistedSession = useCallback(
    async (durationMins?: number) => {
      if (pendingPersistRef.current) {
        return pendingPersistRef.current;
      }
      if (lastPersistedSessionId.current) {
        return { ok: true as const, sessionId: lastPersistedSessionId.current };
      }
      if (!activeProtocol) {
        return { ok: false as const, message: 'No active session' };
      }
      const segs = summary?.segments ?? segments;
      const meta = resolveSessionSave(
        sessionPrimaryCoinRef.current,
        segs,
        activeProtocol,
        durationMins ?? summary?.focusMinutes,
      );
      return persistSession(meta.coin_type, null, null, meta.duration_mins, segs);
    },
    [activeProtocol, persistSession, segments, summary],
  );

  const finishSummary = useCallback(async () => {
    if (!activeProtocol || !summary) {
      resetSessionState();
      return;
    }

    const result = await awaitPersistedSession(summary.focusMinutes);
    if (!result.ok) return;

    resetSessionState();
  }, [activeProtocol, awaitPersistedSession, summary]);

  const skipJournal = useCallback(async () => {
    if (!activeProtocol) return;

    const result = await awaitPersistedSession(summary?.focusMinutes);
    if (!result.ok) return;

    resetSessionState();
  }, [activeProtocol, awaitPersistedSession, summary]);

  const saveJournal = useCallback(async () => {
    if (!activeProtocol) return;

    const note = journalNote.trim() || null;
    const nextBlock = journalNextBlock.trim() || null;

    const persisted = await awaitPersistedSession(summary?.focusMinutes);
    if (!persisted.ok) return;

    if (lastPersistedSessionId.current) {
      const result = await updateSessionNotes(lastPersistedSessionId.current, note, nextBlock);
      if (!result.ok && shouldQueueSessionError(result.message)) {
        await enqueueOfflineSessionJob({
          type: 'update_session_notes',
          sessionId: lastPersistedSessionId.current,
          note,
          nextBlock,
          createdAt: new Date().toISOString(),
        });
        showSuccessToast('Notes saved locally', 'Will sync when you are back online.');
      } else if (!result.ok) {
        Alert.alert('Could not save notes', result.message ?? 'Unknown error');
        return;
      }
    } else if (note || nextBlock) {
      const meta = resolveSessionSave(
        sessionPrimaryCoinRef.current,
        summary?.segments ?? [],
        activeProtocol,
        summary?.focusMinutes,
      );
      const result = await persistSession(
        meta.coin_type,
        note,
        nextBlock,
        meta.duration_mins,
        summary?.segments,
      );
      if (!result.ok) return;
    }

    resetSessionState();
  }, [
    activeProtocol,
    awaitPersistedSession,
    journalNote,
    journalNextBlock,
    persistSession,
    summary,
  ]);

  const extendFlowTwentyMinutes = useCallback(() => {
    lastPersistedSessionId.current = null;
    setPlannedMinutes(20);
    setTimeRemainingSeconds(20 * 60);
    setOvertimeSeconds(0);
    setActiveProtocol('flow');
    setSessionPhase('active');
    sessionStartedAt.current = new Date().toISOString();
    navigateProtocolStack('Active', { protocol: 'flow' });
  }, []);

  const dismissResumeFlowPrompt = useCallback(() => {
    setResumeFlowPrompt(false);
    pendingFlowResumeSecondsRef.current = null;
    setPendingFlowResumeDisplay(null);
    setPausedFlowRemainingSeconds(null);
  }, []);

  function resetSessionState() {
    setSessionPhase('idle');
    setActiveProtocol(null);
    setSummary(null);
    setPausedFlowRemainingSeconds(null);
    setJournalNote('');
    setJournalNextBlock('');
    sessionStartedAt.current = null;
    sessionPrimaryCoinRef.current = null;
    segmentStartedAt.current = null;
    lastPersistedSessionId.current = null;
    resetToApp();
  }

  const isSessionBlocking = useCallback(
    () => sessionPhase === 'active' || sessionPhase === 'overtime',
    [sessionPhase],
  );

  const phaseRef = useRef(sessionPhase);
  phaseRef.current = sessionPhase;

  const catchUpTimerFromWallClock = useCallback(() => {
    const snap = timerSnapshotRef.current;
    if (!snap) return;

    const elapsed = Math.floor((Date.now() - snap.wallMs) / 1000);
    timerSnapshotRef.current = null;
    if (elapsed <= 0) return;

    if (snap.phase === 'active') {
      if (snap.timeRemainingSeconds > elapsed) {
        setTimeRemainingSeconds(snap.timeRemainingSeconds - elapsed);
      } else {
        const intoOvertime = elapsed - snap.timeRemainingSeconds;
        setTimeRemainingSeconds(0);
        setSessionPhase('overtime');
        setOvertimeSeconds(snap.overtimeSeconds + intoOvertime);
      }
    } else {
      setOvertimeSeconds(snap.overtimeSeconds + elapsed);
    }
  }, []);

  useEffect(() => {
    if (authPhase !== 'signedIn') return;

    const flush = () => {
      void flushOfflineSessionQueue();
    };
    flush();

    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      const wasBackground = prev === 'background' || prev === 'inactive';
      const goingBackground = next === 'background' || next === 'inactive';

      if (goingBackground) {
        const phase = phaseRef.current;
        if (phase === 'active' || phase === 'overtime') {
          wentBackgroundAtRef.current = Date.now();
          timerSnapshotRef.current = {
            phase,
            timeRemainingSeconds: timeRemainingRef.current,
            overtimeSeconds: overtimeSecondsRef.current,
            wallMs: Date.now(),
          };
        }
      }

      if (next === 'active' && wasBackground) {
        const phase = phaseRef.current;
        if (phase === 'active' || phase === 'overtime') {
          catchUpTimerFromWallClock();
          const bgMs = wentBackgroundAtRef.current
            ? Date.now() - wentBackgroundAtRef.current
            : 0;
          if (bgMs >= RESUME_OVERLAY_MIN_BACKGROUND_MS) {
            setShowResumeOverlay(true);
          }
        }
        wentBackgroundAtRef.current = null;
        flush();
      }
    });

    return () => sub.remove();
  }, [authPhase, catchUpTimerFromWallClock]);

  useEffect(() => {
    if (sessionPhase !== 'active' && sessionPhase !== 'overtime') {
      timerSnapshotRef.current = null;
      setShowResumeOverlay(false);
    }
  }, [sessionPhase]);

  useEffect(() => {
    if (sessionPhase !== 'active' && sessionPhase !== 'overtime') return;

    const interval = setInterval(() => {
      if (phaseRef.current === 'active') {
        setTimeRemainingSeconds((t) => {
          if (t <= 1) {
            setSessionPhase('overtime');
            return 0;
          }
          return t - 1;
        });
      } else if (phaseRef.current === 'overtime') {
        setOvertimeSeconds((o) => o + 1);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionPhase]);

  useEffect(() => {
    if (sessionPhase !== 'active' && sessionPhase !== 'overtime') return;
    if (!activeProtocol) return;

    const config = PROTOCOL_CONFIG[activeProtocol];
    if (!config.hapticIntervalMinutes) return;

    const intervalMs = config.hapticIntervalMinutes * 60 * 1000;
    const now = Date.now();
    if (now - lastHapticAt.current >= intervalMs) {
      Vibration.vibrate(200);
      lastHapticAt.current = now;
    }
  }, [activeProtocol, sessionPhase, timeRemainingSeconds, overtimeSeconds]);

  useEffect(() => {
    if (activeProtocol !== 'reset') return;

    const rotate = setInterval(() => {
      if (phaseRef.current !== 'active' && phaseRef.current !== 'overtime') return;
      setResetInstructionIndex((i) => (i + 1) % RESET_INSTRUCTIONS.length);
    }, RESET_INSTRUCTION_ROTATE_MS);

    return () => clearInterval(rotate);
  }, [activeProtocol]);

  const resetInstruction = RESET_INSTRUCTIONS[resetInstructionIndex];

  const value = useMemo<SessionContextValue>(
    () => ({
      phase: sessionPhase,
      activeProtocol,
      plannedMinutes,
      timeRemainingSeconds,
      overtimeSeconds,
      flowThought,
      resetInstruction,
      summary,
      journalNote,
      journalNextBlock,
      resumeFlowPrompt,
      pendingFlowResumeSeconds: pendingFlowResumeDisplay,
      pausedFlowRemainingSeconds,
      isSavingSession,
      setPlannedMinutes,
      setFlowThought,
      setJournalNote,
      setJournalNextBlock,
      beginSession,
      endSessionEarly,
      finishSummary,
      skipJournal,
      saveJournal,
      extendFlowTwentyMinutes,
      dismissResumeFlowPrompt,
      handleProtocolTrigger,
      isSessionBlocking,
    }),
    [
      activeProtocol,
      beginSession,
      dismissResumeFlowPrompt,
      endSessionEarly,
      extendFlowTwentyMinutes,
      finishSummary,
      flowThought,
      handleProtocolTrigger,
      isSessionBlocking,
      journalNextBlock,
      journalNote,
      overtimeSeconds,
      plannedMinutes,
      resetInstruction,
      resumeFlowPrompt,
      pendingFlowResumeDisplay,
      pausedFlowRemainingSeconds,
      isSavingSession,
      saveJournal,
      sessionPhase,
      skipJournal,
      summary,
      timeRemainingSeconds,
    ],
  );

  return (
    <SessionContext.Provider value={value}>
      <SessionResumeOverlay
        visible={showResumeOverlay}
        protocol={activeProtocol}
        onContinue={() => setShowResumeOverlay(false)}
        onEndSession={() => {
          setShowResumeOverlay(false);
          endSessionEarly();
        }}
      />
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
