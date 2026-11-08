package expo.modules.rtspplayer

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.SystemClock
import android.provider.Settings
import android.util.Log

/**
 * Background motion watch: while the app is NOT on screen, polls each CP Plus / Dahua recorder
 * for motion and, when "display over other apps" is allowed, brings the app up with that camera
 * (the camera screen then shrinks itself into a picture-in-picture window).
 *
 * Configuration (incl. passwords) is handed over in memory only — never via Intent extras,
 * which pass through the system.
 */
class MotionPopupService : Service() {
  data class Channel(val number: Int, val cameraId: String)
  data class Recorder(
    val deviceId: String,
    val host: String,
    val httpPort: Int,
    val username: String,
    val password: String,
    val channels: List<Channel>,
  )

  companion object {
    private const val TAG = "CamxMotion"
    private const val CHANNEL_ID = "camx-motion"
    private const val NOTIFICATION_ID = 4711
    private const val POLL_MS = 1500L
    private const val ERROR_BACKOFF_MS = 5000L
    private const val COOLDOWN_MS = 60_000L
    private val CODES = listOf("VideoMotion", "SmartMotionHuman", "SmartMotionVehicle")

    @Volatile private var recorders: List<Recorder> = emptyList()

    /** Camera the service asked the app to show; JS takes it when it comes to the front. */
    @Volatile var pendingPopup: String? = null
    @Volatile var popupListener: ((String) -> Unit)? = null

    fun start(context: Context, config: List<Recorder>) {
      recorders = config
      val intent = Intent(context, MotionPopupService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    fun stop(context: Context) {
      recorders = emptyList()
      context.stopService(Intent(context, MotionPopupService::class.java))
    }

    fun canPopUp(context: Context): Boolean =
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

    fun takePendingPopup(): String? = pendingPopup.also { pendingPopup = null }
  }

  private lateinit var thread: HandlerThread
  private lateinit var handler: Handler
  private val authFailed = mutableSetOf<String>()
  private val lastPopup = mutableMapOf<String, Long>()

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    thread = HandlerThread("camx-motion").also { it.start() }
    handler = Handler(thread.looper)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startInForeground()
    authFailed.clear()
    handler.removeCallbacksAndMessages(null)
    handler.post(::pollAll)
    // Not sticky: after a process death we no longer have the (memory-only) credentials.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    thread.quitSafely()
    super.onDestroy()
  }

  private fun startInForeground() {
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Motion watch", NotificationManager.IMPORTANCE_MIN))
    }
    @Suppress("DEPRECATION") // the single-arg constructor is the only option before Android 8
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this)
    val notification = builder
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Watching cameras for motion")
      .setOngoing(true)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun appInForeground(): Boolean {
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE || Pip.inPip
  }

  private fun pollAll() {
    var delay = POLL_MS
    // While the app is on screen the in-app watcher (JS) does this; don't double the load.
    if (!appInForeground()) {
      for (r in recorders) {
        if (r.deviceId in authFailed) continue
        try {
          val active = motionChannels(r)
          for (ch in r.channels) if (ch.number in active) maybePopUp(ch.cameraId)
        } catch (e: DigestHttp.AuthFailed) {
          authFailed += r.deviceId // never retry a wrong password (recorder lockout)
          Log.w(TAG, "${r.deviceId}: login failed, motion watch stopped for this recorder")
        } catch (e: Exception) {
          delay = ERROR_BACKOFF_MS
        }
      }
    }
    if (recorders.isNotEmpty()) handler.postDelayed(::pollAll, delay)
  }

  private fun motionChannels(r: Recorder): Set<Int> {
    val host = if (r.host.contains(':')) "[${r.host}]" else r.host
    val out = mutableSetOf<Int>()
    for (code in CODES) {
      val res = DigestHttp.get(
        "http://$host:${r.httpPort}/cgi-bin/eventManager.cgi?action=getEventIndexes&code=$code",
        r.username, r.password, 4000,
      )
      if (res.code == 200) out += DigestHttp.parseEventChannels(res.body)
    }
    return out
  }

  private fun maybePopUp(cameraId: String) {
    val now = SystemClock.elapsedRealtime()
    if (now - (lastPopup[cameraId] ?: -COOLDOWN_MS) < COOLDOWN_MS) return
    if (!canPopUp(this)) return
    lastPopup[cameraId] = now
    pendingPopup = cameraId
    popupListener?.invoke(cameraId)
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    try {
      startActivity(launch)
    } catch (e: Exception) {
      Log.w(TAG, "could not bring app forward: ${e.javaClass.simpleName}")
    }
  }
}
