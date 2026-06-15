package com.risemobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.BitmapFactory
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class RiseSessionService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSession()
      return START_NOT_STICKY
    }

    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    isRunning = true
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSession()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    isRunning = false
    super.onDestroy()
  }

  private fun stopSession() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
    isRunning = false
  }

  private fun buildNotification(): Notification {
    ensureChannel()

    val launchIntent =
      packageManager.getLaunchIntentForPackage(packageName)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }

    val contentIntent =
      PendingIntent.getActivity(
        this,
        0,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

    val largeIcon = BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher)

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Rise")
      .setContentText("Waits for NFC tap")
      .setSmallIcon(R.drawable.ic_rise_notification)
      .setLargeIcon(largeIcon)
      .setShowWhen(false)
      .setOngoing(false)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(contentIntent)
      .build()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = getSystemService(NotificationManager::class.java) ?: return
    val existing = manager.getNotificationChannel(CHANNEL_ID)
    if (existing != null) return

    val channel =
      NotificationChannel(
        CHANNEL_ID,
        "Rise background",
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "Keeps Rise running while you are signed in"
        setShowBadge(false)
      }
    manager.createNotificationChannel(channel)
  }

  companion object {
    const val CHANNEL_ID = "rise_session"
    const val NOTIFICATION_ID = 1001
    const val ACTION_STOP = "com.risemobile.session.STOP"

    @Volatile
    var isRunning: Boolean = false
  }
}
