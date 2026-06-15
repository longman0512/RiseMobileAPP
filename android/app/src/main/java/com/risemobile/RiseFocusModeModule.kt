package com.risemobile

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Phase 2 stub: Digital Wellbeing / usage-stats restriction APIs will activate here.
 */
class RiseFocusModeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "RiseFocusMode"

  @ReactMethod
  fun activate(protocol: String, promise: Promise) {
    promise.resolve(false)
  }
}
