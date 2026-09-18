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

import { deactivateFocusModeOnSessionEnd, syncFocusModeForProtocol } from '../lib/focusMode';
import {
  enqueueOfflineSessionJob,
  flushOfflineSessionQueue,
  shouldQueueSessionError,
} from '../lib/offlineSessionQueue';
import { navigateProtocolStack, resetToApp } from '../lib/navigationRef';
import { showSuccessToast } from '../lib/toast';
import { PROTOCOL_CONFIG, RESET_INSTRUCTIONS, RESET_INSTRUCTION_ROTATE_MS } from '../lib/protocolConfig';
import { suggestPauseMinutes, type TirednessLevel } from '../lib/pauseDuration';
import { endShift as commitShift, type ShiftEndReason } from '../lib/shiftApi';
import { endSession, type SessionSegment } from '../lib/sessionApi';
import {
  focusBlockCount,
  shiftXp,
  totalFocusMinutes,
  totalOvertimeMinutes,
  type ShiftBlock,
  type XpBreakdown,
} from '../lib/xp';
import { publishStatus, resetPublishedStatusCache } from '../lib/squadApi';
import { useAuth } from './AuthProvider';
import { useCoins } from './CoinsProvider';
import type { CoinType } from '../types/coins';

/**
 * A Shift is a chain of blocks. There is no "single session" mode — a shift
 * that happened to contain one block is just a short shift. Nothing is decided
 * up front: the user taps Lock In or Flow to start a block, and only when they
 * tap the Reset coin do they choose Pause (another block coming) or End Shift
 * (done for the day).
 */
export type SessionPhase =
  | 'idle'
  | 'prestart'
  | 'active'
  | 'overtime'
  | 'resetChoice'
  | 'tiredness'
  | 'closeout'
  | 'breathing'
  | 'endShift'
  | 'finale';

export type FinaleSummary = {
  xp: XpBreakdown;
  focusMinutes: number;
  overtimeMinutes: number;
  blockCount: number;
  shiftMinutes: number;
  lifetimeXp: number | null;
};

type SessionContextValue = {
  phase: SessionPhase;
  activeProtocol: CoinType | null;
  plannedMinutes: number;
  /** Seconds elapsed in the current block, standard + overtime. */
  blockElapsedSeconds: number;
  /** Counts down to zero, then stays there while overtime accrues. */
  blockRemainingSeconds: number;
  blockOvertimeSeconds: number;
  isOvertime: boolean;
  /** 1-based position of the current block within the shift. */
  blockIndex: number;
  shiftOpen: boolean;
  shiftBlocks: ShiftBlock[];
  shiftFocusMinutes: number;
  resetInstruction: string;
  tiredness: TirednessLevel | null;
  pauseMinutes: number;
  pauseRemainingSeconds: number;
  pauseComplete: boolean;
  closeoutDone: string;
  closeoutNext: string;
  nextTarget: string;
  finale: FinaleSummary | null;
  isSaving: boolean;
  setPlannedMinutes: (minutes: number) => void;
  setCloseoutDone: (text: string) => void;
  setCloseoutNext: (text: string) => void;
  setNextTarget: (text: string) => void;
  beginBlock: (plannedMinutesOverride?: number) => void;
  chooseTiredness: (level: TirednessLevel) => void;
  startPause: () => void;
  resumeBlock: () => void;
  finishCloseout: () => void;
  finishBreathing: () => void;
  chooseEndShift: () => void;
  confirmEndShift: () => Promise<void>;
  dismissFinale: () => void;
  exitNow: () => Promise<void>;
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

const TICK_POLL_MS = 500;
/** A shift left untouched this long is closed silently on the next app open. */
const SHIFT_AUTO_CLOSE_MS = 4 * 60 * 60 * 1000;

function minutesFromSeconds(seconds: number): number {
  return Math.max(0, Math.round(seconds / 60));
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { phase: authPhase } = useAuth();
  const { coins } = useCoins();

  const [phase, setPhaseState] = useState<SessionPhase>('idle');
  const [activeProtocol, setActiveProtocolState] = useState<CoinType | null>(null);
  const [plannedMinutes, setPlannedMinutesState] = useState(50);
  const [blockElapsedSeconds, setBlockElapsedState] = useState(0);
  const [shiftBlocks, setShiftBlocksState] = useState<ShiftBlock[]>([]);
  const [tiredness, setTirednessState] = useState<TirednessLevel | null>(null);
  const [pauseMinutes, setPauseMinutesState] = useState(0);
  const [pauseRemainingSeconds, setPauseRemainingState] = useState(0);
  const [pauseComplete, setPauseCompleteState] = useState(false);
  const [closeoutDone, setCloseoutDoneState] = useState('');
  const [closeoutNext, setCloseoutNextState] = useState('');
  const [nextTarget, setNextTargetState] = useState('');
  const [finale, setFinale] = useState<FinaleSummary | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [resetInstructionIndex, setResetInstructionIndex] = useState(0);

  // Everything the ticker and the commit path read comes from refs, so neither
  // is affected by unrelated re-renders (typing in a prompt, for example) and
  // both see live values when they fire between renders.
  const phaseRef = useRef<SessionPhase>('idle');
  const protocolRef = useRef<CoinType | null>(null);
  const plannedMinutesRef = useRef(50);
  const blockElapsedRef = useRef(0);
  const blockStartedAtRef = useRef<string | null>(null);
  const shiftBlocksRef = useRef<ShiftBlock[]>([]);
  const shiftStartedAtRef = useRef<string | null>(null);
  const shiftTouchedAtRef = useRef<number>(0);
  const pauseRemainingRef = useRef(0);
  /** When the breathing screen opened. The pause is billed from this, not from
   *  the suggested duration — leaving after 1 minute of a 12-minute suggestion
   *  must record 1, or the chain reports a break the user never took. */
  const pauseStartedAtRef = useRef<number | null>(null);
  const pauseCompleteRef = useRef(false);
  const closeoutDoneRef = useRef('');
  const closeoutNextRef = useRef('');
  const nextTargetRef = useRef('');
  const lastTickMsRef = useRef(Date.now());
  const lastHapticAtRef = useRef(0);
  const committingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const bankPauseRef = useRef<(() => void) | null>(null);

  const setPhase = useCallback((next: SessionPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const setProtocol = useCallback((next: CoinType | null) => {
    protocolRef.current = next;
    setActiveProtocolState(next);
  }, []);

  const setPlannedMinutes = useCallback((minutes: number) => {
    plannedMinutesRef.current = minutes;
    setPlannedMinutesState(minutes);
  }, []);

  const setBlockElapsed = useCallback((seconds: number) => {
    blockElapsedRef.current = seconds;
    setBlockElapsedState(seconds);
  }, []);

  const setShiftBlocks = useCallback((blocks: ShiftBlock[]) => {
    shiftBlocksRef.current = blocks;
    setShiftBlocksState(blocks);
  }, []);

  const setPauseRemaining = useCallback((seconds: number) => {
    pauseRemainingRef.current = seconds;
    setPauseRemainingState(seconds);
  }, []);

  const setPauseComplete = useCallback((value: boolean) => {
    pauseCompleteRef.current = value;
    setPauseCompleteState(value);
  }, []);

  const setCloseoutDone = useCallback((text: string) => {
    closeoutDoneRef.current = text;
    setCloseoutDoneState(text);
  }, []);

  const setCloseoutNext = useCallback((text: string) => {
    closeoutNextRef.current = text;
    setCloseoutNextState(text);
  }, []);

  const setNextTarget = useCallback((text: string) => {
    nextTargetRef.current = text;
    setNextTargetState(text);
  }, []);

  const hasCoinType = useCallback(
    (type: CoinType) => coins.some((c) => c.coin_type === type && c.active),
    [coins],
  );

  const touchShift = useCallback(() => {
    shiftTouchedAtRef.current = Date.now();
  }, []);

  // -------------------------------------------------------------------------
  // Derived block figures
  // -------------------------------------------------------------------------

  const plannedSeconds = plannedMinutes * 60;
  const blockRemainingSeconds = Math.max(0, plannedSeconds - blockElapsedSeconds);
  const blockOvertimeSeconds = Math.max(0, blockElapsedSeconds - plannedSeconds);
  const isOvertime = blockOvertimeSeconds > 0;

  /** Close the running block and fold it into the shift chain. */
  const bankCurrentBlock = useCallback((): ShiftBlock | null => {
    const protocol = protocolRef.current;
    if (!protocol) return null;

    const elapsed = blockElapsedRef.current;
    const planned = plannedMinutesRef.current * 60;
    const standardSecs = Math.min(elapsed, planned);
    const overtimeSecs = Math.max(0, elapsed - planned);

    const block: ShiftBlock = {
      protocol,
      standardMins: minutesFromSeconds(standardSecs),
      overtimeMins: minutesFromSeconds(overtimeSecs),
    };

    // A block the user barely started should not bank a phantom minute.
    if (block.standardMins === 0 && block.overtimeMins === 0) return null;

    setShiftBlocks([...shiftBlocksRef.current, block]);
    return block;
  }, [setShiftBlocks]);

  /** Mirror the chain to the squad table so friends see live state. */
  const publishShiftStatus = useCallback(
    (state: 'lockin' | 'flow' | 'paused' | 'offline', startedAt?: string | null) => {
      void publishStatus({
        state,
        startedAt: startedAt ?? blockStartedAtRef.current,
        shiftStartedAt: shiftStartedAtRef.current,
        blocks: shiftBlocksRef.current.map((b) => ({
          protocol: b.protocol,
          duration_mins: b.standardMins + b.overtimeMins,
        })),
      });
    },
    [],
  );

  /** Keep the legacy per-block history rows so Journey/streaks keep working. */
  const recordBlockHistory = useCallback(
    async (block: ShiftBlock, startedAt: string) => {
      if (authPhase !== 'signedIn') return;
      if (block.protocol === 'reset') return;

      const segments: SessionSegment[] = [
        { protocol: block.protocol, duration_mins: block.standardMins + block.overtimeMins },
      ];
      const payload = {
        coin_type: block.protocol,
        started_at: startedAt,
        duration_mins: block.standardMins + block.overtimeMins,
        note: null,
        next_block: null,
        segments,
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

  const resetShiftState = useCallback(() => {
    committingRef.current = false;
    setPhase('idle');
    setProtocol(null);
    setBlockElapsed(0);
    setShiftBlocks([]);
    setTirednessState(null);
    setPauseMinutesState(0);
    setPauseRemaining(0);
    setPauseComplete(false);
    setCloseoutDone('');
    setCloseoutNext('');
    setNextTarget('');
    shiftStartedAtRef.current = null;
    blockStartedAtRef.current = null;
    void deactivateFocusModeOnSessionEnd();
    publishShiftStatus('offline');
  }, [
    publishShiftStatus,
    setBlockElapsed,
    setCloseoutDone,
    setCloseoutNext,
    setNextTarget,
    setPauseComplete,
    setPauseRemaining,
    setPhase,
    setProtocol,
    setShiftBlocks,
  ]);

  // -------------------------------------------------------------------------
  // Committing a shift — the only moment XP becomes permanent
  // -------------------------------------------------------------------------

  const commitShiftNow = useCallback(
    async (reason: ShiftEndReason): Promise<FinaleSummary | null> => {
      if (committingRef.current) return null;
      committingRef.current = true;
      setIsSaving(true);

      try {
        const blocks = shiftBlocksRef.current;
        const startedAt = shiftStartedAtRef.current ?? new Date().toISOString();
        const xp = shiftXp(blocks);
        const summary: FinaleSummary = {
          xp,
          focusMinutes: totalFocusMinutes(blocks),
          overtimeMinutes: totalOvertimeMinutes(blocks),
          blockCount: focusBlockCount(blocks),
          shiftMinutes: Math.max(
            0,
            Math.round((Date.now() - new Date(startedAt).getTime()) / 60000),
          ),
          lifetimeXp: null,
        };

        if (blocks.length === 0 || authPhase !== 'signedIn') {
          return summary;
        }

        const result = await commitShift({
          startedAt,
          blocks,
          focusMins: summary.focusMinutes,
          overtimeMins: summary.overtimeMinutes,
          blockCount: summary.blockCount,
          xp,
          nextTarget: nextTargetRef.current.trim() || null,
          reason,
        });

        if (!result.ok) {
          // The per-block history rows are already saved (or queued), so the
          // work is not lost — only the shift roll-up failed.
          showSuccessToast('Shift saved locally', 'XP will sync when you are back online.');
          return summary;
        }

        return { ...summary, lifetimeXp: result.lifetimeXp ?? null };
      } finally {
        committingRef.current = false;
        setIsSaving(false);
      }
    },
    [authPhase],
  );

  // -------------------------------------------------------------------------
  // Blocks
  // -------------------------------------------------------------------------

  const openPreStart = useCallback(
    (protocol: CoinType) => {
      // Resuming straight from the breathing screen still ends the pause.
      bankPauseRef.current?.();
      const config = PROTOCOL_CONFIG[protocol];
      setProtocol(protocol);
      setPlannedMinutes(config.defaultMinutes);
      setBlockElapsed(0);
      setPhase('prestart');
      navigateProtocolStack('PreStart', { protocol });
    },
    [setBlockElapsed, setPhase, setPlannedMinutes, setProtocol],
  );

  const startBlock = useCallback(
    (protocol: CoinType, minutes: number) => {
      const now = new Date().toISOString();
      if (!shiftStartedAtRef.current) shiftStartedAtRef.current = now;
      blockStartedAtRef.current = now;
      touchShift();

      setProtocol(protocol);
      setPlannedMinutes(minutes);
      setBlockElapsed(0);
      setPauseComplete(false);
      setPauseRemaining(0);
      setTirednessState(null);
      setPhase('active');
      lastTickMsRef.current = Date.now();
      lastHapticAtRef.current = Date.now();

      void syncFocusModeForProtocol(protocol);
      publishShiftStatus(protocol === 'flow' ? 'flow' : 'lockin', now);
      navigateProtocolStack('Active', { protocol });
    },
    [
      publishShiftStatus,
      setBlockElapsed,
      setPauseComplete,
      setPauseRemaining,
      setPhase,
      setPlannedMinutes,
      setProtocol,
      touchShift,
    ],
  );

  const beginBlock = useCallback(
    (plannedMinutesOverride?: number) => {
      const protocol = protocolRef.current;
      if (!protocol) return;
      startBlock(protocol, plannedMinutesOverride ?? plannedMinutesRef.current);
    },
    [startBlock],
  );

  // -------------------------------------------------------------------------
  // Reset coin → Pause or End Shift
  // -------------------------------------------------------------------------

  const openResetChoice = useCallback(() => {
    bankPauseRef.current?.();
    setPhase('resetChoice');
    navigateProtocolStack('ResetChoice', {});
  }, [setPhase]);

  /**
   * Back out of the Reset choice and carry on with the block that is still
   * running. The clock is frozen while the choice screen is up (the ticker only
   * advances in active/overtime), so the wall-clock anchor is re-based here —
   * otherwise the seconds spent deciding would all land in one jump.
   */
  const resumeBlock = useCallback(() => {
    const protocol = protocolRef.current;
    if (!protocol) return;
    lastTickMsRef.current = Date.now();
    const planned = plannedMinutesRef.current * 60;
    setPhase(blockElapsedRef.current > planned ? 'overtime' : 'active');
    navigateProtocolStack('Active', { protocol });
  }, [setPhase]);

  /** Pause chosen: bank the block, then ask how tired they are. */
  const startPause = useCallback(() => {
    const banked = bankCurrentBlock();
    if (banked && blockStartedAtRef.current) {
      void recordBlockHistory(banked, blockStartedAtRef.current);
    }
    setProtocol(null);
    setBlockElapsed(0);
    touchShift();
    setPhase('tiredness');
    navigateProtocolStack('Tiredness', {});
  }, [bankCurrentBlock, recordBlockHistory, setBlockElapsed, setPhase, setProtocol, touchShift]);

  const chooseTiredness = useCallback(
    (level: TirednessLevel) => {
      const blocks = shiftBlocksRef.current;
      const last = blocks[blocks.length - 1];
      const minutes = suggestPauseMinutes({
        tiredness: level,
        shiftFocusMinutes: totalFocusMinutes(blocks),
        cameFromOvertime: (last?.overtimeMins ?? 0) > 0,
      });

      setTirednessState(level);
      setPauseMinutesState(minutes);
      setPauseRemaining(minutes * 60);
      setPauseComplete(false);
      setPhase('closeout');
      navigateProtocolStack('Closeout', {});
    },
    [setPauseComplete, setPauseRemaining, setPhase],
  );

  const finishCloseout = useCallback(() => {
    pauseStartedAtRef.current = Date.now();
    setResetInstructionIndex(0);
    setPhase('breathing');
    lastTickMsRef.current = Date.now();
    // Apps stay blocked through the pause — no deactivate here on purpose.
    publishShiftStatus('paused', new Date().toISOString());
    navigateProtocolStack('Breathe', {});
  }, [publishShiftStatus, setPhase]);

  /**
   * Close the pause and fold the time actually spent resting into the chain.
   * Idempotent, because a pause can be left three ways: tapping the breathing
   * screen, tapping a focus coin to resume, or tapping Reset again.
   */
  const bankPause = useCallback(() => {
    const startedAt = pauseStartedAtRef.current;
    if (startedAt == null) return;
    pauseStartedAtRef.current = null;

    const mins = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    setShiftBlocks([
      ...shiftBlocksRef.current,
      { protocol: 'reset', standardMins: mins, overtimeMins: 0 },
    ]);
  }, [setShiftBlocks]);

  /** Leaving the breathing screen: the shift stays open, awaiting a coin tap. */
  bankPauseRef.current = bankPause;

  const finishBreathing = useCallback(() => {
    bankPause();
    setPhase('idle');
    touchShift();
    resetToApp();
  }, [bankPause, setPhase, touchShift]);

  const chooseEndShift = useCallback(() => {
    const banked = bankCurrentBlock();
    if (banked && blockStartedAtRef.current) {
      void recordBlockHistory(banked, blockStartedAtRef.current);
    }
    setProtocol(null);
    setBlockElapsed(0);
    setPhase('endShift');
    navigateProtocolStack('EndShift', {});
  }, [bankCurrentBlock, recordBlockHistory, setBlockElapsed, setPhase, setProtocol]);

  const confirmEndShift = useCallback(async () => {
    const summary = await commitShiftNow('end_shift');
    void deactivateFocusModeOnSessionEnd();
    publishShiftStatus('offline');
    setFinale(summary);
    setPhase('finale');
    navigateProtocolStack('Finale', {});
  }, [commitShiftNow, publishShiftStatus, setPhase]);

  const dismissFinale = useCallback(() => {
    setFinale(null);
    resetShiftState();
    resetToApp();
  }, [resetShiftState]);

  /**
   * The always-available escape hatch. Ends the block and the shift on the
   * spot, with no reward screen — but the XP is still banked. Leaving early is
   * a neutral fact, never a penalty.
   */
  const exitNow = useCallback(async () => {
    const banked = bankCurrentBlock();
    if (banked && blockStartedAtRef.current) {
      void recordBlockHistory(banked, blockStartedAtRef.current);
    }
    await commitShiftNow('exit');
    resetShiftState();
    resetToApp();
  }, [bankCurrentBlock, commitShiftNow, recordBlockHistory, resetShiftState]);

  const cancelSession = useCallback(() => {
    // Backing out of PreStart never started a block; if that leaves the shift
    // with nothing in it, close it entirely.
    setProtocol(null);
    setBlockElapsed(0);
    if (shiftBlocksRef.current.length === 0) {
      resetShiftState();
    } else {
      setPhase('idle');
    }
    resetToApp();
  }, [resetShiftState, setBlockElapsed, setPhase, setProtocol]);

  // -------------------------------------------------------------------------
  // Coin taps
  // -------------------------------------------------------------------------

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

      const current = phaseRef.current;

      if (protocol === 'reset') {
        // Reset only means something while a shift exists.
        if (current === 'active' || current === 'overtime') {
          openResetChoice();
          return;
        }
        if (current === 'idle' && shiftStartedAtRef.current) {
          openResetChoice();
          return;
        }
        if (current === 'breathing') {
          openResetChoice();
        }
        return;
      }

      // Lock In / Flow start or resume a block — always by coin tap.
      if (current === 'resetChoice') {
        // The user changed their mind. Same coin: carry on with the running
        // block. Different coin: bank this one and start the next block of the
        // SAME shift — no pause needed to switch protocol.
        if (protocolRef.current === protocol) {
          resumeBlock();
          return;
        }
        const banked = bankCurrentBlock();
        if (banked && blockStartedAtRef.current) {
          void recordBlockHistory(banked, blockStartedAtRef.current);
        }
        setProtocol(null);
        setBlockElapsed(0);
        openPreStart(protocol);
        return;
      }

      if (current === 'idle' || current === 'prestart' || current === 'breathing') {
        openPreStart(protocol);
      }
      // While a block runs, a focus coin is ignored: only Reset or Exit stop it.
    },
    [
      authPhase,
      bankCurrentBlock,
      hasCoinType,
      openPreStart,
      openResetChoice,
      recordBlockHistory,
      resumeBlock,
      setBlockElapsed,
      setProtocol,
    ],
  );

  // -------------------------------------------------------------------------
  // Clocks
  // -------------------------------------------------------------------------

  /**
   * Wall-clock driven so a suspended JS thread (backgrounded app, locked
   * screen) catches up exactly on the next tick instead of losing that time.
   */
  const tick = useCallback(() => {
    const now = Date.now();
    const delta = Math.floor((now - lastTickMsRef.current) / 1000);
    if (delta <= 0) return;
    lastTickMsRef.current += delta * 1000;

    const current = phaseRef.current;

    if (current === 'active' || current === 'overtime') {
      const nextElapsed = blockElapsedRef.current + delta;
      setBlockElapsed(nextElapsed);

      // The timer never alarms and never stops: at zero it simply inverts.
      const planned = plannedMinutesRef.current * 60;
      if (nextElapsed > planned && current === 'active') {
        setPhase('overtime');
      }
      return;
    }

    if (current === 'breathing') {
      const remaining = pauseRemainingRef.current - delta;
      if (remaining > 0) {
        setPauseRemaining(remaining);
        return;
      }
      if (!pauseCompleteRef.current) {
        setPauseRemaining(0);
        setPauseComplete(true);
        // Double haptic marks the end of the rest.
        Vibration.vibrate([0, 60, 90, 60]);
      }
    }
  }, [setBlockElapsed, setPauseComplete, setPauseRemaining, setPhase]);

  useEffect(() => {
    const running =
      phase === 'active' || phase === 'overtime' || phase === 'breathing';
    if (!running) return;

    const interval = setInterval(tick, TICK_POLL_MS);
    return () => clearInterval(interval);
  }, [phase, tick]);

  // Interval haptics during a block.
  useEffect(() => {
    if (phase !== 'active' && phase !== 'overtime') return;
    if (!activeProtocol) return;

    const config = PROTOCOL_CONFIG[activeProtocol];
    if (!config.hapticIntervalMinutes) return;

    const intervalMs = config.hapticIntervalMinutes * 60 * 1000;
    const now = Date.now();
    if (now - lastHapticAtRef.current >= intervalMs) {
      Vibration.vibrate(200);
      lastHapticAtRef.current = now;
    }
  }, [activeProtocol, phase, blockElapsedSeconds]);

  useEffect(() => {
    if (phase !== 'breathing') return;
    const rotate = setInterval(() => {
      setResetInstructionIndex((i) => (i + 1) % RESET_INSTRUCTIONS.length);
    }, RESET_INSTRUCTION_ROTATE_MS);
    return () => clearInterval(rotate);
  }, [phase]);

  // Foreground: catch the clock up and flush anything queued offline.
  useEffect(() => {
    if (authPhase !== 'signedIn') return;

    const flush = () => {
      void flushOfflineSessionQueue();
    };
    flush();

    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (next !== 'active' || prev === 'active') return;

      tick();
      flush();

      // A shift nobody touched for hours is closed quietly: its XP still banks,
      // but an abandoned shift should not gate rewards forever.
      const idleFor = Date.now() - shiftTouchedAtRef.current;
      if (
        phaseRef.current === 'idle' &&
        shiftStartedAtRef.current &&
        shiftBlocksRef.current.length > 0 &&
        idleFor > SHIFT_AUTO_CLOSE_MS
      ) {
        void (async () => {
          await commitShiftNow('auto');
          resetShiftState();
        })();
      }
    });

    return () => sub.remove();
  }, [authPhase, commitShiftNow, resetShiftState, tick]);

  // Signing out must not leave a shift, a timer or a shield behind.
  useEffect(() => {
    if (authPhase === 'signedIn') return;
    if (phaseRef.current === 'idle' && !shiftStartedAtRef.current) return;
    resetShiftState();
    resetPublishedStatusCache();
  }, [authPhase, resetShiftState]);

  const isSessionBlocking = useCallback(
    () => phase === 'active' || phase === 'overtime' || phase === 'breathing',
    [phase],
  );

  const shiftFocusMinutes = useMemo(() => totalFocusMinutes(shiftBlocks), [shiftBlocks]);
  const blockIndex = useMemo(() => focusBlockCount(shiftBlocks) + 1, [shiftBlocks]);
  const resetInstruction = RESET_INSTRUCTIONS[resetInstructionIndex];

  const value = useMemo<SessionContextValue>(
    () => ({
      phase,
      activeProtocol,
      plannedMinutes,
      blockElapsedSeconds,
      blockRemainingSeconds,
      blockOvertimeSeconds,
      isOvertime,
      blockIndex,
      shiftOpen: shiftStartedAtRef.current != null,
      shiftBlocks,
      shiftFocusMinutes,
      resetInstruction,
      tiredness,
      pauseMinutes,
      pauseRemainingSeconds,
      pauseComplete,
      closeoutDone,
      closeoutNext,
      nextTarget,
      finale,
      isSaving,
      setPlannedMinutes,
      setCloseoutDone,
      setCloseoutNext,
      setNextTarget,
      beginBlock,
      chooseTiredness,
      startPause,
      resumeBlock,
      finishCloseout,
      finishBreathing,
      chooseEndShift,
      confirmEndShift,
      dismissFinale,
      exitNow,
      cancelSession,
      handleProtocolTrigger,
      isSessionBlocking,
    }),
    [
      activeProtocol,
      beginBlock,
      blockElapsedSeconds,
      blockIndex,
      blockOvertimeSeconds,
      blockRemainingSeconds,
      cancelSession,
      chooseEndShift,
      chooseTiredness,
      closeoutDone,
      closeoutNext,
      confirmEndShift,
      dismissFinale,
      exitNow,
      finale,
      finishBreathing,
      finishCloseout,
      handleProtocolTrigger,
      isOvertime,
      isSaving,
      isSessionBlocking,
      nextTarget,
      pauseComplete,
      pauseMinutes,
      pauseRemainingSeconds,
      phase,
      plannedMinutes,
      resetInstruction,
      setCloseoutDone,
      setCloseoutNext,
      setNextTarget,
      setPlannedMinutes,
      shiftBlocks,
      shiftFocusMinutes,
      resumeBlock,
      startPause,
      tiredness,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
