import { Platform } from 'react-native';
import NfcManager, {
  Ndef,
  NfcAdapter,
  NfcEvents,
  NfcTech,
  type NdefRecord,
  type TagEvent,
} from 'react-native-nfc-manager';

/**
 * Global "an NFC session is in progress" flag. Only one NFC session can exist at
 * a time, so the registration screens set this while their listener is mounted
 * and the global coin-tap listener stands down while it is true. Exposed as a
 * tiny pub/sub so React can react to changes (e.g. via useSyncExternalStore).
 */
let nfcBusy = false;
const nfcBusyListeners = new Set<() => void>();

export function isNfcBusy(): boolean {
  return nfcBusy;
}

export function setNfcBusy(value: boolean): void {
  if (nfcBusy === value) return;
  nfcBusy = value;
  nfcBusyListeners.forEach((listener) => listener());
}

export function subscribeNfcBusy(listener: () => void): () => void {
  nfcBusyListeners.add(listener);
  return () => {
    nfcBusyListeners.delete(listener);
  };
}

/**
 * Android reader-mode flags for continuous, passive UID scanning. Polls the
 * common tag technologies and skips the NDEF check so blank tags (e.g. a
 * factory NTAG215) still report their UID, and suppresses the platform tag
 * sound for a quieter in-app experience.
 */
const ANDROID_READER_MODE_FLAGS =
  NfcAdapter.FLAG_READER_NFC_A |
  NfcAdapter.FLAG_READER_NFC_B |
  NfcAdapter.FLAG_READER_NFC_F |
  NfcAdapter.FLAG_READER_NFC_V |
  NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK |
  NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS;

/**
 * iOS tag technologies for a Tag Reader Session. This reads the chip UID of any
 * supported tag (e.g. NTAG215) regardless of whether it holds an NDEF message,
 * unlike an NDEF reader session which silently ignores blank/unformatted tags.
 *
 * FeliCa is intentionally omitted: including it makes the native module enable
 * FeliCa polling (NFCPollingISO18092), which iOS rejects unless Info.plist
 * declares com.apple.developer.nfc.readersession.felica.systemcodes. Without
 * that key the scan session fails to start and the system scan sheet never
 * appears. The session always polls ISO14443 + ISO15693, so NTAG215 (ISO 14443
 * Type A) is still detected and its UID read.
 */
const IOS_TAG_TECHS = [NfcTech.MifareIOS, NfcTech.Iso15693IOS];

/** True when an NFC error represents the user dismissing the iOS scan sheet. */
export function isNfcCancelError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /cancel/i.test(message);
}

export function normalizeCoinId(raw: string | number[] | undefined | null): string | null {
  if (raw == null) return null;

  if (Array.isArray(raw)) {
    return raw.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  const trimmed = String(raw).trim().replace(/[^0-9a-fA-F]/g, '');
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

function decodeNdefUrl(records: NdefRecord[] | undefined | null): string | null {
  if (!records?.length) return null;

  for (const record of records) {
    const payload = Uint8Array.from(record.payload ?? []);
    try {
      if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_URI)) {
        const url = Ndef.uri.decodePayload(payload).trim();
        if (url) return url;
      }
      if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_TEXT)) {
        const text = Ndef.text.decodePayload(payload).trim();
        if (/^https?:\/\//i.test(text)) return text;
      }
      if (record.tnf === Ndef.TNF_ABSOLUTE_URI) {
        const url = Ndef.util.bytesToString(payload).trim();
        if (url) return url;
      }
    } catch {
      // Ignore malformed records and keep looking for a usable URL.
    }
  }

  return null;
}

export async function isNfcSupported(): Promise<boolean> {
  try {
    return await NfcManager.isSupported();
  } catch {
    return false;
  }
}

export async function isNfcEnabled(): Promise<boolean> {
  try {
    return await NfcManager.isEnabled();
  } catch {
    return false;
  }
}

export async function initNfc(): Promise<boolean> {
  const supported = await isNfcSupported();
  if (!supported) return false;
  await NfcManager.start();
  return true;
}

/**
 * Shows the iOS NFC "Ready to Scan" sheet once, then cancels quickly.
 * Android does not show an OS permission sheet for NFC.
 */
export async function promptNfcSessionOnce(): Promise<void> {
  if (Platform.OS !== 'ios') return;

  const supported = await initNfc();
  if (!supported) return;

  try {
    await NfcManager.requestTechnology(IOS_TAG_TECHS, {
      alertMessage: 'Hold your coin near the top of your phone',
    });
  } catch {
    // ignore (user may cancel)
  } finally {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // ignore
    }
  }
}

export type NfcTagListener = (coinId: string) => void;

export type StartNfcListenerOptions = {
  /**
   * Android only: use reader mode (skips the NDEF check and platform sound) for
   * continuous passive scanning. Ignored on iOS, which always uses a one-shot
   * Tag Reader Session with the system scan sheet.
   */
  readerMode?: boolean;
};

/**
 * Starts an NFC read session. Calls onTag with normalized coin_id when a tag is detected.
 * Returns a cleanup function to cancel listening.
 */
export async function startNfcListener(
  onTag: NfcTagListener,
  options?: StartNfcListenerOptions,
): Promise<() => void> {
  const supported = await initNfc();
  if (!supported) {
    throw new Error('NFC is not supported on this device.');
  }

  if (Platform.OS === 'ios') {
    // iOS uses a one-shot Tag Reader Session (the system scan sheet). This reads
    // the UID of any tag, including blank NTAG215 coins that an NDEF session would
    // ignore. Reading a tag resolves the session; the screen restarts it as needed.
    let cancelled = false;

    void (async () => {
      try {
        await NfcManager.requestTechnology(IOS_TAG_TECHS, {
          alertMessage: 'Hold your coin near the top of your phone',
        });
        const tag = await NfcManager.getTag();
        const coinId = normalizeCoinId(tag?.id);
        if (!cancelled && coinId) {
          onTag(coinId);
        }
      } catch (e: unknown) {
        // A user-canceled scan sheet is expected; only log genuine failures
        // (e.g. a misconfigured session that never shows the scan sheet).
        if (!cancelled && !isNfcCancelError(e)) {
          console.warn('[nfc] iOS tag session failed:', e);
        }
      } finally {
        try {
          await NfcManager.cancelTechnologyRequest();
        } catch {
          // ignore
        }
      }
    })();

    return async () => {
      cancelled = true;
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch {
        // ignore
      }
    };
  }

  const enabled = await isNfcEnabled();
  if (!enabled) {
    throw new Error('NFC is turned off. Enable NFC in Settings to register coins.');
  }

  NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag: TagEvent | null) => {
    const coinId = normalizeCoinId(tag?.id);
    if (coinId) {
      onTag(coinId);
    }
  });

  await NfcManager.registerTagEvent(
    options?.readerMode
      ? { isReaderModeEnabled: true, readerModeFlags: ANDROID_READER_MODE_FLAGS }
      : undefined,
  );

  return async () => {
    try {
      NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
      await NfcManager.unregisterTagEvent();
    } catch {
      // ignore teardown errors
    }
  };
}

/** One-shot read using technology request (fallback). */
export async function readCoinIdOnce(): Promise<string> {
  const supported = await initNfc();
  if (!supported) {
    throw new Error('NFC is not supported on this device.');
  }

  const tech = Platform.OS === 'ios' ? IOS_TAG_TECHS : NfcTech.Ndef;
  try {
    await NfcManager.requestTechnology(tech, {
      alertMessage: 'Hold your coin near the back of your phone',
    });
    const tag = await NfcManager.getTag();
    const coinId = normalizeCoinId(tag?.id);
    if (!coinId) {
      throw new Error('Could not read coin ID from tag.');
    }
    return coinId;
  } finally {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // ignore
    }
  }
}

export type CoinRegistrationTag = {
  coinId: string;
  ndefUrl: string | null;
};

export async function cancelNfcRequest(): Promise<void> {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {
    // ignore
  }
}

/** One-shot foreground scan for Settings registration: reads UID and NDEF URL. */
export async function readCoinRegistrationTagOnce(): Promise<CoinRegistrationTag> {
  const supported = await initNfc();
  if (!supported) {
    throw new Error('NFC is not supported on this device.');
  }

  const tech = Platform.OS === 'ios' ? IOS_TAG_TECHS : NfcTech.Ndef;
  try {
    await NfcManager.requestTechnology(tech, {
      alertMessage: 'Hold your coin near the back of your phone',
    });
    const tag = await NfcManager.getTag();
    const coinId = normalizeCoinId(tag?.id);
    if (!coinId) {
      throw new Error('Could not read coin ID from tag.');
    }

    return {
      coinId,
      ndefUrl: decodeNdefUrl(tag?.ndefMessage),
    };
  } finally {
    await cancelNfcRequest();
  }
}
