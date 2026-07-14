package com.risemobile

import android.content.Context

/**
 * Persists the user's per-protocol app blocklists and the currently-enforced
 * blocklist. Backed by SharedPreferences so the AccessibilityService (a separate
 * process-level component) and the React Native module share the same state.
 *
 * Only "lockin" and "flow" carry blocklists; "reset" clears blocking.
 */
object FocusBlockStore {
  private const val PREFS = "rise_focus"
  private const val KEY_ACTIVE = "active"
  private const val KEY_ACTIVE_LIST = "active_blocklist"
  private const val KEY_SELECTION_PREFIX = "selection."

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun normalizeProtocol(protocol: String): String? =
    when (protocol.trim().lowercase()) {
      "lockin" -> "lockin"
      "flow" -> "flow"
      else -> null
    }

  /** Packages the user chose to block for a given protocol. */
  fun getSelection(context: Context, protocol: String): Set<String> {
    val name = normalizeProtocol(protocol) ?: return emptySet()
    return prefs(context).getStringSet(KEY_SELECTION_PREFIX + name, emptySet()) ?: emptySet()
  }

  fun setSelection(context: Context, protocol: String, packages: Set<String>) {
    val name = normalizeProtocol(protocol) ?: return
    prefs(context).edit().putStringSet(KEY_SELECTION_PREFIX + name, packages).apply()
  }

  fun hasSelection(context: Context, protocol: String): Boolean =
    getSelection(context, protocol).isNotEmpty()

  /** Turn blocking on for a protocol by promoting its selection to the active list. */
  fun activate(context: Context, protocol: String): Boolean {
    val name = normalizeProtocol(protocol) ?: return false
    val selection = getSelection(context, name)
    prefs(context)
      .edit()
      .putStringSet(KEY_ACTIVE_LIST, selection)
      .putBoolean(KEY_ACTIVE, selection.isNotEmpty())
      .apply()
    return selection.isNotEmpty()
  }

  fun deactivate(context: Context) {
    prefs(context)
      .edit()
      .putBoolean(KEY_ACTIVE, false)
      .putStringSet(KEY_ACTIVE_LIST, emptySet())
      .apply()
  }

  fun isActive(context: Context): Boolean = prefs(context).getBoolean(KEY_ACTIVE, false)

  fun activeBlocklist(context: Context): Set<String> =
    prefs(context).getStringSet(KEY_ACTIVE_LIST, emptySet()) ?: emptySet()

  /** True when the given package should be blocked right now. */
  fun shouldBlock(context: Context, packageName: String): Boolean =
    isActive(context) && activeBlocklist(context).contains(packageName)
}
