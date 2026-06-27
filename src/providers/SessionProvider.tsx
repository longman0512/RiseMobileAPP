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
import { deactivateFocusModeOnSessionEnd, syncFocusModeForProtocol } from '../lib/focusMode';
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
import { sessionPointsEarned } from '../lib/sessionScoring';
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
  exits: number;
  pointsEarned: number;
  totalPointsAfter: number;
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
  /** Elapsed seconds for open-ended FLOW sessions. */
  elapsedSeconds: number;
  sessionExits: number;
  flowThought: string;
  resetInstruction: string;
  summary: SessionSummary | null;
  journalNote: string;
  journalNextBlock: string;
  resumeFlowPrompt: boolean;
  pendingFlowResumeSeconds: number | null;
  pausedFlowRemainingSeconds: number | null;
  /** 1-based index of the current segment within this session. */
  segmentIndex: number;
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
  cancelSession: () => void;
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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionExits, setSessionExits] = useState(0);
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
  const elapsedSecondsRef = useRef(0);
  const activeProtocolRef = useRef<CoinType | null>(null);
  const timerSnapshotRef = useRef<{
    phase: 'active' | 'overtime';
    timeRemainingSeconds: number;
    overtimeSeconds: number;
    elapsedSeconds: number;
    protocol: CoinType | null;
    wallMs: number;
  } | null>(null);
  const wentBackgroundAtRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const completeActiveSessionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    timeRemainingRef.current = timeRemainingSeconds;
  }, [timeRemainingSeconds]);

  useEffect(() => {
    overtimeSecondsRef.current = overtimeSeconds;
  }, [overtimeSeconds]);

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  useEffect(() => {
    activeProtocolRef.current = activeProtocol;
  }, [activeProtocol]);

  function playLockInCompleteFeedback() {
    Vibration.vibrate([0, 80, 60, 120]);
  }

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
    setElapsedSeconds(0);
    setSessionExits(0);
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

  const startFlowSegment = useCallback((resumeElapsedSeconds = 0) => {
    const now = new Date().toISOString();
    if (!sessionStartedAt.current) sessionStartedAt.current = now;
    segmentStartedAt.current = now;
    setActiveProtocol('flow');
    setPlannedMinutes(PROTOCOL_CONFIG.flow.defaultMinutes);
    setElapsedSeconds(resumeElapsedSeconds);
    setTimeRemainingSeconds(0);
    setOvertimeSeconds(0);
    setSessionPhase('active');
    lastHapticAt.current = Date.now();
    void syncFocusModeForProtocol('flow');
    navigateProtocolStack('Active', { protocol: 'flow' });
  }, []);

  const startActiveSegment = useCallback((protocol: CoinType, durationSeconds: number) => {
    const now = new Date().toISOString();
    if (!sessionStartedAt.current) sessionStartedAt.current = now;
    segmentStartedAt.current = now;
    const segmentPlannedMins = Math.max(1, Math.ceil(durationSeconds / 60));
    setActiveProtocol(protocol);
    setPlannedMinutes(segmentPlannedMins);
    setTimeRemainingSeconds(durationSeconds);
    setOvertimeSeconds(0);
    setElapsedSeconds(0);
    setSessionPhase('active');
    lastHapticAt.current = Date.now();
    if (protocol === 'reset') {
      setResetInstructionIndex(0);
    }
    void syncFocusModeForProtocol(protocol);
    navigateProtocolStack('Active', { protocol });
  }, []);

  const closeSegment = useCallback((protocol: CoinType, elapsedSeconds: number) => {
    const mins = elapsedSecondsToMinutes(elapsedSeconds);
    setSegments((prev) => [...prev, { protocol, duration_mins: mins }]);
  }, []);

  const flowElapsed = useCallback(() => Math.max(1, elapsedSecondsRef.current), []);

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
          startFlowSegment(pending);
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
          if (protocol === 'lockin') {
            const elapsed = flowElapsed();
            void persistInterimSegment('flow', elapsedSecondsToMinutes(elapsed));
            openPreStart('lockin');
            return;
          }
          if (protocol === 'reset') {
            closeSegment('flow', flowElapsed());
            setPausedFlowRemainingSeconds(elapsedSecondsRef.current);
            const resetSeconds = PROTOCOL_CONFIG.reset.defaultMinutes * 60;
            startActiveSegment('reset', resetSeconds);
          }
          if (protocol === 'flow') {
            // Ignore duplicate Flow tap while already in Flow.
          }
          return;
        }

        if (current === 'reset') {
          if (protocol === 'flow') {
            if (pausedFlowRemainingSeconds != null) {
              const elapsed = segmentElapsedSeconds(
                plannedMinutes,
                timeRemainingSeconds,
                overtimeSeconds,
              );
              closeSegment('reset', Math.max(elapsed, 1));
              startFlowSegment(pausedFlowRemainingSeconds);
              setPausedFlowRemainingSeconds(null);
            } else {
              completeActiveSessionRef.current?.();
            }
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
      flowElapsed,
      hasCoinType,
      openPreStart,
      overtimeSeconds,
      pausedFlowRemainingSeconds,
      persistInterimSegment,
      plannedMinutes,
      sessionPhase,
      startActiveSegment,
      startFlowSegment,
      timeRemainingSeconds,
    ],
  );

  const beginSession = useCallback(
    (plannedMinutesOverride?: number) => {
      if (!activeProtocol) return;
      sessionStartedAt.current = new Date().toISOString();
      sessionPrimaryCoinRef.current = activeProtocol;
      setSegments([]);
      setSessionExits(0);
      timerSnapshotRef.current = null;

      if (activeProtocol === 'flow') {
        setPlannedMinutes(PROTOCOL_CONFIG.flow.defaultMinutes);
        startFlowSegment(0);
        void openFlowPlaylist(musicService);
        return;
      }

      const mins = plannedMinutesOverride ?? plannedMinutes;
      setPlannedMinutes(mins);
      startActiveSegment(activeProtocol, mins * 60);
    },
    [activeProtocol, musicService, plannedMinutes, startActiveSegment, startFlowSegment],
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

    const elapsedActive =
      activeProtocol === 'flow'
        ? Math.max(1, elapsedSecondsRef.current)
        : segmentElapsedSeconds(
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

    const scoringMinutes =
      activeProtocol === 'lockin'
        ? mins
        : activeProtocol === 'flow'
          ? focusMinutes
          : 0;
    const pointsEarned = sessionPointsEarned(activeProtocol, scoringMinutes, sessionExits);

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
      exits: sessionExits,
      pointsEarned,
      totalPointsAfter: 0,
    });

    const endScreen = PROTOCOL_CONFIG[activeProtocol].endScreen;
    void deactivateFocusModeOnSessionEnd();

    // RESET captures its reflection live during the session, so persist those
    // notes now and return straight to the main screen (no end reflection screen).
    const goStraightHome = endScreen === 'none';
    const liveNote = goStraightHome ? journalNote.trim() || null : null;
    const liveNextBlock = goStraightHome ? journalNextBlock.trim() || null : null;

    if (endScreen === 'summary') {
      setSessionPhase('summary');
      navigateProtocolStack('Summary', { protocol: activeProtocol });
    } else if (endScreen === 'journal') {
      setSessionPhase('journal');
      navigateProtocolStack('Journal', { protocol: activeProtocol });
    }

    setPausedFlowRemainingSeconds(null);
    pendingFlowResumeSecondsRef.current = null;

    const persistPromise = persistSession(
      activeProtocol,
      liveNote,
      liveNextBlock,
      focusMinutes,
      nextSegments,
    );
    pendingPersistRef.current = persistPromise;
    void persistPromise.finally(() => {
      if (pendingPersistRef.current === persistPromise) {
        pendingPersistRef.current = null;
      }
    });

    // Return home immediately for RESET; persistence continues in the background.
    if (goStraightHome) {
      resetSessionState();
    }
  }, [
    activeProtocol,
    journalNote,
    journalNextBlock,
    overtimeSeconds,
    persistSession,
    plannedMinutes,
    segments,
    sessionPhase,
    sessionExits,
    timeRemainingSeconds,
  ]);

  completeActiveSessionRef.current = completeActiveSession;

  const handleResetTimerEnd = useCallback(() => {
    if (activeProtocol !== 'reset') return;
    if (pausedFlowRemainingSeconds != null) {
      closeSegment('reset', plannedMinutes);
      startFlowSegment(pausedFlowRemainingSeconds);
      setPausedFlowRemainingSeconds(null);
      return;
    }
    completeActiveSession();
  }, [
    activeProtocol,
    closeSegment,
    completeActiveSession,
    pausedFlowRemainingSeconds,
    plannedMinutes,
    startFlowSegment,
  ]);

  const handleLockInTimerEnd = useCallback(() => {
    if (activeProtocol !== 'lockin') return;
    playLockInCompleteFeedback();
    completeActiveSession();
  }, [activeProtocol, completeActiveSession]);

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
    setActiveProtocol('flow');
    setSessionPhase('active');
    sessionStartedAt.current = new Date().toISOString();
    void syncFocusModeForProtocol('flow');
    navigateProtocolStack('Active', { protocol: 'flow' });
  }, []);

  const dismissResumeFlowPrompt = useCallback(() => {
    setResumeFlowPrompt(false);
    pendingFlowResumeSecondsRef.current = null;
    setPendingFlowResumeDisplay(null);
    setPausedFlowRemainingSeconds(null);
  }, []);

  // Abandon the pre-start screen (or any non-active protocol screen) and return
  // to the main app. Guarantees the user always has a way back to the main
  // screen even if a protocol screen opens unexpectedly.
  const cancelSession = useCallback(() => {
    resetSessionState();
  }, []);

  function resetSessionState() {
    void deactivateFocusModeOnSessionEnd();
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

    if (snap.protocol === 'flow') {
      setElapsedSeconds(snap.elapsedSeconds + elapsed);
      return;
    }

    if (snap.phase === 'active') {
      if (snap.timeRemainingSeconds > elapsed) {
        setTimeRemainingSeconds(snap.timeRemainingSeconds - elapsed);
      } else {
        const intoOvertime = elapsed - snap.timeRemainingSeconds;
        setTimeRemainingSeconds(0);
        if (snap.protocol === 'lockin') {
          handleLockInTimerEnd();
        } else if (snap.protocol === 'reset') {
          handleResetTimerEnd();
        } else {
          setSessionPhase('overtime');
          setOvertimeSeconds(snap.overtimeSeconds + intoOvertime);
        }
      }
    } else {
      setOvertimeSeconds(snap.overtimeSeconds + elapsed);
    }
  }, [handleLockInTimerEnd, handleResetTimerEnd]);

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
          setSessionExits((count) => count + 1);
          wentBackgroundAtRef.current = Date.now();
          timerSnapshotRef.current = {
            phase,
            timeRemainingSeconds: timeRemainingRef.current,
            overtimeSeconds: overtimeSecondsRef.current,
            elapsedSeconds: elapsedSecondsRef.current,
            protocol: activeProtocolRef.current,
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
      const proto = activeProtocolRef.current;

      if (proto === 'flow' && phaseRef.current === 'active') {
        setElapsedSeconds((e) => e + 1);
        return;
      }

      if (phaseRef.current === 'active') {
        setTimeRemainingSeconds((t) => {
          if (t <= 1) {
            if (proto === 'lockin') {
              setTimeout(() => handleLockInTimerEnd(), 0);
              return 0;
            }
            if (proto === 'reset') {
              setTimeout(() => handleResetTimerEnd(), 0);
              return 0;
            }
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
  }, [sessionPhase, handleLockInTimerEnd, handleResetTimerEnd]);

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
      elapsedSeconds,
      sessionExits,
      flowThought,
      resetInstruction,
      summary,
      journalNote,
      journalNextBlock,
      resumeFlowPrompt,
      pendingFlowResumeSeconds: pendingFlowResumeDisplay,
      pausedFlowRemainingSeconds,
      segmentIndex: segments.length + 1,
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
      cancelSession,
      handleProtocolTrigger,
      isSessionBlocking,
    }),
    [
      activeProtocol,
      beginSession,
      cancelSession,
      dismissResumeFlowPrompt,
      elapsedSeconds,
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
      segments,
      sessionExits,
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
