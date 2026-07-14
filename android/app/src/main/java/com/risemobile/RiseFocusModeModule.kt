package com.risemobile

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import android.text.TextUtils
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

/**
 * Android app blocking, mirroring the iOS Family Controls module interface.
 * Enforcement runs in [RiseFocusAccessibilityService]; this module manages
 * authorization (the accessibility permission) and the per-protocol blocklists.
 */
class RiseFocusModeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "RiseFocusMode"

  private fun isAccessibilityServiceEnabled(): Boolean {
    val expected =
      ComponentName(reactContext, RiseFocusAccessibilityService::class.java).flattenToString()

    val enabledSetting =
      Settings.Secure.getInt(
        reactContext.contentResolver,
        Settings.Secure.ACCESSIBILITY_ENABLED,
        0,
      )
    if (enabledSetting != 1) return false

    val enabledServices =
      Settings.Secure.getString(
        reactContext.contentResolver,
        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
      ) ?: return false

    val splitter = TextUtils.SimpleStringSplitter(':')
    splitter.setString(enabledServices)
    for (service in splitter) {
      if (service.equals(expected, ignoreCase = true)) return true
    }
    return false
  }

  @ReactMethod
  fun isAuthorized(promise: Promise) {
    promise.resolve(isAccessibilityServiceEnabled())
  }

  /**
   * Opens the system Accessibility settings so the user can enable the Rise
   * service, then resolves the current (usually not-yet-enabled) state. The JS
   * layer re-checks [isAuthorized] when the app regains focus.
   */
  @ReactMethod
  fun requestAuthorization(promise: Promise) {
    try {
      if (isAccessibilityServiceEnabled()) {
        promise.resolve(true)
        return
      }
      val intent =
        Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
      reactContext.startActivity(intent)
      promise.resolve(false)
    } catch (e: Exception) {
      promise.reject("focus_authorization_failed", e.message, e)
    }
  }

  @ReactMethod
  fun activate(protocol: String, promise: Promise) {
    val name = protocol.trim().lowercase()
    if (name == "reset") {
      FocusBlockStore.deactivate(reactContext)
      promise.resolve(true)
      return
    }
    if (name != "lockin" && name != "flow") {
      promise.resolve(false)
      return
    }
    if (!isAccessibilityServiceEnabled()) {
      promise.resolve(false)
      return
    }
    val applied = FocusBlockStore.activate(reactContext, name)
    promise.resolve(applied)
  }

  @ReactMethod
  fun deactivate(promise: Promise) {
    FocusBlockStore.deactivate(reactContext)
    promise.resolve(null)
  }

  @ReactMethod
  fun hasSelection(protocol: String, promise: Promise) {
    promise.resolve(FocusBlockStore.hasSelection(reactContext, protocol))
  }

  @ReactMethod
  fun getSelection(protocol: String, promise: Promise) {
    val result = Arguments.createArray()
    for (pkg in FocusBlockStore.getSelection(reactContext, protocol)) {
      result.pushString(pkg)
    }
    promise.resolve(result)
  }

  @ReactMethod
  fun setSelection(protocol: String, packages: ReadableArray, promise: Promise) {
    val set = HashSet<String>()
    for (i in 0 until packages.size()) {
      packages.getString(i)?.let { set.add(it) }
    }
    FocusBlockStore.setSelection(reactContext, protocol, set)
    promise.resolve(true)
  }

  /**
   * Lists launchable, non-system-critical apps for the in-app picker. Returns
   * `{ packageName, appName }` sorted by display name. Excludes Rise itself.
   */
  @ReactMethod
  fun getInstalledApps(promise: Promise) {
    try {
      val pm = reactContext.packageManager
      val launcherIntent =
        Intent(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_LAUNCHER) }
      val resolveInfos = pm.queryIntentActivities(launcherIntent, 0)

      val seen = HashSet<String>()
      val apps =
        resolveInfos
          .mapNotNull { info ->
            val pkg = info.activityInfo?.packageName ?: return@mapNotNull null
            if (pkg == reactContext.packageName) return@mapNotNull null
            if (!seen.add(pkg)) return@mapNotNull null
            val label = info.loadLabel(pm)?.toString() ?: pkg
            pkg to label
          }
          .sortedBy { it.second.lowercase() }

      val result = Arguments.createArray()
      for ((pkg, label) in apps) {
        val map = Arguments.createMap()
        map.putString("packageName", pkg)
        map.putString("appName", label)
        result.pushMap(map)
      }
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("focus_list_apps_failed", e.message, e)
    }
  }
}
