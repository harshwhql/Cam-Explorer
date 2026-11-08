package expo.modules.rtspplayer

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.util.Rational

/**
 * Picture-in-picture for the full-screen camera: pressing Home keeps the camera playing in a
 * corner window. MainActivity forwards onUserLeaveHint / onPictureInPictureModeChanged here
 * (patched in by plugins/withPictureInPicture.js).
 */
object Pip {
  @Volatile private var enabled = false
  @Volatile private var aspect = Rational(16, 9)
  @Volatile var inPip = false
    private set
  @Volatile var listener: ((Boolean) -> Unit)? = null
  @Volatile private var enteringAt = 0L

  /** In PiP, or Home was just pressed and PiP is on its way (Android may report background first). */
  fun isActiveOrEntering(): Boolean = inPip || SystemClock.uptimeMillis() - enteringAt < 1500

  fun isSupported(activity: Activity?): Boolean =
    activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

  /** Called by JS (main thread) when the camera screen opens/closes or the video size is known. */
  fun configure(activity: Activity?, enable: Boolean, width: Int, height: Int) {
    enabled = enable
    if (width > 0 && height > 0) {
      // Android only allows aspect ratios between 1:2.39 and 2.39:1.
      val r = width.toFloat() / height
      aspect = if (r in 0.42f..2.39f) Rational(width, height) else Rational(16, 9)
    }
    if (!isSupported(activity) || activity == null) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      // Android 12+: enter PiP automatically on Home, with a smooth animation.
      try {
        activity.setPictureInPictureParams(params(auto = enable))
      } catch (e: Exception) {
        // Some TV builds reject params updates; manual enter below still works.
      }
    }
  }

  @JvmStatic
  fun onUserLeaveHint(activity: Activity) {
    if (!enabled || inPip || !isSupported(activity)) return
    enteringAt = SystemClock.uptimeMillis()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return // auto-enter handles it
    try {
      activity.enterPictureInPictureMode(params(auto = false))
    } catch (e: Exception) {
      // Device refused PiP (e.g. disabled by the user) — just go to the background.
    }
  }

  /** Enter PiP right now (motion pop-up). Returns false if the device refuses. */
  fun enterNow(activity: Activity?): Boolean {
    if (!isSupported(activity) || activity == null) return false
    return try {
      activity.enterPictureInPictureMode(params(auto = false))
    } catch (e: Exception) {
      false
    }
  }

  @JvmStatic
  fun onModeChanged(isInPip: Boolean) {
    inPip = isInPip
    enteringAt = 0L
    listener?.invoke(isInPip)
  }

  private fun params(auto: Boolean): PictureInPictureParams {
    val b = PictureInPictureParams.Builder().setAspectRatio(aspect)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      b.setAutoEnterEnabled(auto)
      b.setSeamlessResizeEnabled(true)
    }
    return b.build()
  }
}
