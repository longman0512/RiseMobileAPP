package com.risemobile

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class RiseSessionModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "RiseSession"

  @ReactMethod
  fun start(promise: Promise) {
    try {
      if (RiseSessionService.isRunning) {
        promise.resolve(null)
        return
      }

      val intent = Intent(reactContext, RiseSessionService::class.java)
      ContextCompat.startForegroundService(reactContext, intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("RISE_SESSION_START_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      if (!RiseSessionService.isRunning) {
        promise.resolve(null)
        return
      }

      val intent =
        Intent(reactContext, RiseSessionService::class.java).apply {
          action = RiseSessionService.ACTION_STOP
        }
      reactContext.startService(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("RISE_SESSION_STOP_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun isRunning(promise: Promise) {
    promise.resolve(RiseSessionService.isRunning)
  }
}
