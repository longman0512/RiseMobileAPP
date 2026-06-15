# RISE Mobile — Phase 2 (deferred)

Phase 1 implements NFC deep links, three protocol session flows, coin registration, history/streak, and onboarding (coins, guided Focus setup, music picker, priority contacts) without native app blocking.

## iOS Focus Mode

- Use `FocusFilterIntent` on iOS 16+ to activate **RISE Lock In**, **RISE Flow**, and **RISE Reset** modes at session start.
- Fallback for iOS 15: deep link to Settings → Focus with a checklist UI in onboarding.
- **Open question (spec §13):** Confirm the app process stays alive for timer + haptics when Focus Mode is active and the screen is locked.

## Android app restriction

- Choose and implement one approach: Digital Wellbeing API, usage stats + overlay, or OEM-specific APIs.
- Mirror iOS protocol rules: same blocked apps per mode, same haptic intervals.

## Background timer and haptics

- Verify session timer and haptic reminders while app is backgrounded or screen locked.
- May require foreground service (Android) and BGTask / audio-less keep-alive strategy (iOS) — confirm with product before build.

## Onboarding extensions (Phase 1 delivered in app)

- Guided Focus Mode setup UI with Settings deep links (native `FocusFilterIntent` still Phase 2).
- Music service picker (Spotify / Apple Music / None) with playlist deep link on FLOW start.
- Priority contacts picker (stored locally; OS message filtering still Phase 2).

## Offline sync

- Phase 1 ships an AsyncStorage outbox (`src/lib/offlineSessionQueue.ts`) for `complete_session` and `update_session_notes`, flushed on `AppState` `active`. Full offline UX and NetInfo-driven reconnect remain here if product wants tighter guarantees.

## Native Focus Mode bridge

- Android: `RiseFocusModeModule.activate` (stub, returns false until Digital Wellbeing / restriction APIs land).
- iOS: `FocusFilterIntent` still required; session start falls back to Settings reminder via `src/lib/focusMode.ts`.

## Legacy features (hidden in Phase 1)

- Activation code screen, BLE pairing screens, Leaderboard tab, mock Dashboard — re-enable via feature flags when needed.
