package expo.modules.rtspplayer

import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.videolan.libvlc.Dialog
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.util.VLCVideoLayout

object VlcSupport {
  const val AVAILABLE = true
}

/**
 * Compatibility engine (libVLC) with the same props/events contract as RtspPlayerView.
 * Credentials go in as :rtsp-user/:rtsp-pwd options, never in the URL. A rejected login makes
 * VLC raise a login dialog — we treat that as a definite "auth" failure (never retried).
 */
class VlcPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true

  private val onStatus by EventDispatcher()
  private val onVideoSize by EventDispatcher()

  private val layout = VLCVideoLayout(context)
  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null

  var pendingSource: SourceRecord? = null
  var pendingMuted = true
  var pendingAudioEnabled = false
  var pendingPaused = false
  var stallTimeoutMs = 8_000L
  var connectTimeoutMs = 15_000L
  private var scale = MediaPlayer.ScaleType.SURFACE_BEST_FIT

  private var activeKey: String? = null
  private var lastState: String? = null
  private var startedAt = 0L
  private var firstFrame = false
  private var lastProgressAt = 0L

  init {
    setBackgroundColor(Color.BLACK)
    addView(layout, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun setResizeMode(mode: String) {
    scale = when (mode) {
      "cover" -> MediaPlayer.ScaleType.SURFACE_FIT_SCREEN
      "fill" -> MediaPlayer.ScaleType.SURFACE_FILL
      else -> MediaPlayer.ScaleType.SURFACE_BEST_FIT
    }
    player?.videoScale = scale
  }

  fun applyProps() {
    val src = pendingSource
    val wantKey = if (src == null || src.uri.isBlank() || pendingPaused) {
      null
    } else {
      "${src.uri}|${src.username}|${src.password?.hashCode()}|${src.transport}|${src.reloadKey}|$pendingAudioEnabled"
    }
    if (wantKey != activeKey) {
      releasePlayer()
      activeKey = wantKey
      if (src != null && wantKey != null) start(src) else emitStatus(if (pendingPaused) "paused" else "idle")
    }
    player?.volume = if (pendingMuted) 0 else 100
  }

  private fun start(src: SourceRecord) {
    val vlc = shared(context)
    val uri = try {
      // JS never sends credentials in the URL; strip any anyway.
      Uri.parse(src.uri).buildUpon().encodedAuthority(Uri.parse(src.uri).encodedAuthority?.substringAfterLast('@')).build()
    } catch (e: Exception) {
      fail("unknown", "Invalid stream address")
      return
    }
    val p = MediaPlayer(vlc)
    p.attachViews(layout, null, false, false)
    p.videoScale = scale
    val media = Media(vlc, uri)
    media.setHWDecoderEnabled(true, false)
    media.addOption(":network-caching=600")
    if (src.transport != "udp") media.addOption(":rtsp-tcp")
    if (!pendingAudioEnabled) media.addOption(":no-audio")
    src.username?.takeIf { it.isNotEmpty() }?.let { media.addOption(":rtsp-user=$it") }
    src.password?.let { media.addOption(":rtsp-pwd=$it") }
    p.media = media
    media.release()
    p.setEventListener(listener)
    p.volume = if (pendingMuted) 0 else 100
    player = p
    connecting += this
    startedAt = SystemClock.elapsedRealtime()
    lastProgressAt = startedAt
    firstFrame = false
    emitStatus("connecting")
    p.play()
    handler.postDelayed(watchdog, 1_000)
  }

  private val listener = MediaPlayer.EventListener { e ->
    when (e.type) {
      MediaPlayer.Event.Vout -> if (e.voutCount > 0 && !firstFrame) {
        firstFrame = true
        connecting -= this
        lastProgressAt = SystemClock.elapsedRealtime()
        emitStatus("playing")
        player?.currentVideoTrack?.let { t ->
          if (t.width > 0 && t.height > 0) onVideoSize(mapOf("width" to t.width, "height" to t.height))
        }
      }
      MediaPlayer.Event.TimeChanged -> lastProgressAt = SystemClock.elapsedRealtime()
      MediaPlayer.Event.Buffering -> if (firstFrame) emitStatus(if (e.buffering < 100f) "buffering" else "playing")
      MediaPlayer.Event.EndReached -> fail("ended", "The recorder closed the stream")
      MediaPlayer.Event.EncounteredError -> fail("unknown", "Compatibility engine could not play this stream")
      else -> Unit
    }
  }

  private val watchdog = object : Runnable {
    override fun run() {
      if (player == null) return
      val now = SystemClock.elapsedRealtime()
      if (!firstFrame && now - startedAt > connectTimeoutMs) {
        fail("timeout", "No video within ${connectTimeoutMs / 1000}s")
        return
      }
      if (firstFrame && now - lastProgressAt > stallTimeoutMs) {
        fail("stall", "No new frames for ${stallTimeoutMs / 1000}s")
        return
      }
      handler.postDelayed(this, 1_000)
    }
  }

  private fun fail(code: String, message: String) {
    releasePlayer()
    lastState = null
    emitStatus("error", code, message)
  }

  private fun emitStatus(state: String, code: String? = null, message: String? = null) {
    if (code == null && state == lastState) return
    lastState = state
    val payload = mutableMapOf<String, Any>("state" to state)
    code?.let { payload["code"] = it }
    message?.let { payload["message"] = Redact.text(it) }
    onStatus(payload)
  }

  private fun releasePlayer() {
    handler.removeCallbacks(watchdog)
    connecting -= this
    player?.let {
      it.setEventListener(null)
      try {
        it.stop()
        it.detachViews()
      } finally {
        it.release()
      }
    }
    player = null
    firstFrame = false
  }

  fun release() {
    releasePlayer()
    activeKey = null
    lastState = null
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    if (player != null) {
      releasePlayer()
      activeKey = null
      lastState = null
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (player == null && activeKey == null) applyProps()
  }

  companion object {
    private const val TAG = "CamxVlc"
    private var sharedVlc: LibVLC? = null
    /** Views still waiting for their first frame (candidates for a login failure). */
    private val connecting = mutableSetOf<VlcPlayerView>()

    private fun shared(context: Context): LibVLC =
      sharedVlc ?: LibVLC(context.applicationContext, arrayListOf("--no-stats", "--no-sub-autodetect-file")).also { vlc ->
        sharedVlc = vlc
        Dialog.setCallbacks(vlc, object : Dialog.Callbacks {
          override fun onDisplay(dialog: Dialog.LoginDialog) {
            // Credentials rejected: never answer (that would retry the login) — fail as "auth".
            dialog.dismiss()
            Log.w(TAG, "login rejected by the recorder")
            for (v in connecting.toList()) v.fail("auth", "Wrong username or password")
          }

          override fun onDisplay(dialog: Dialog.ErrorMessage) {
            dialog.dismiss()
          }

          override fun onDisplay(dialog: Dialog.QuestionDialog) {
            dialog.dismiss()
          }

          override fun onDisplay(dialog: Dialog.ProgressDialog) = Unit

          override fun onCanceled(dialog: Dialog?) = Unit

          override fun onProgressUpdate(dialog: Dialog.ProgressDialog) = Unit
        })
      }
  }
}
