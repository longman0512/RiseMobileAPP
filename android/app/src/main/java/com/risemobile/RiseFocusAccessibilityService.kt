package com.risemobile

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent

/**
 * Watches foreground app changes and, while a RISE focus session is active,
 * intercepts any app on the active blocklist by launching a full-screen block
 * screen. This is the standard no-device-owner approach to app blocking on
 * Android (mirrors the iOS Family Controls shield).
 */
class RiseFocusAccessibilityService : AccessibilityService() {

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

    val packageName = event.packageName?.toString() ?: return

    // Never block ourselves or the block screen (would loop), and only act while
    // a session is enforcing a non-empty blocklist.
    if (packageName == applicationContext.packageName) return
    if (!FocusBlockStore.shouldBlock(applicationContext, packageName)) return

    val intent =
      Intent(this, FocusBlockActivity::class.java).apply {
        addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_CLEAR_TASK or
            Intent.FLAG_ACTIVITY_NO_ANIMATION,
        )
        putExtra(FocusBlockActivity.EXTRA_BLOCKED_PACKAGE, packageName)
      }
    startActivity(intent)
  }

  override fun onInterrupt() {
    // No-op: we do not hold long-running feedback.
  }
}
