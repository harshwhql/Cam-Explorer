package expo.modules.rtspplayer

import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Format
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.DecoderReuseEvaluation
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.exoplayer.rtsp.RtspMediaSource
import expo.modules.kotlin.AppContext
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import javax.net.SocketFactory
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * Live RTSP view backed by Media3 ExoPlayer.
 *
 * Responsibilities kept native (they must work even if JS is busy):
 *  - low-latency live buffering, RTSP over TCP
 *  - connect timeout + frame-stall watchdog
 *  - error classification (auth / unreachable / stall / decoder ...)
 *
 * Reconnect *policy* lives in JS (tested backoff): on error we release the player and
 * report; JS bumps `source.reloadKey` when it wants a retry.
 */
@OptIn(UnstableApi::class)
class RtspPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true

  private val onStatus by EventDispatcher()
  private val onVideoSize by EventDispatcher()

  private val frame = VideoFrameLayout(context)
  private val handler = Handler(Looper.getMainLooper())
  private var player: ExoPlayer? = null

  // Props staged by the module, applied together in applyProps().
  var pendingSource: SourceRecord? = null
  var pendingMuted = true
  /** Whether the audio track is set up at all. Fixed per session: RTSP can't add tracks mid-stream. */
  var pendingAudioEnabled = false
  var pendingPaused = false
  var pendingSurfaceType = "texture"
  var stallTimeoutMs = 8_000L
  var connectTimeoutMs = 15_000L

  private var activeKey: String? = null
  private var label = ""
  private var lastStatsAt = 0L
  private var muted = true
  private var audioEnabled = false
  private var lastState: String? = null

  // Watchdog state
  private var startedAt = 0L
  private var firstFrame = false
  private var lastFrameCount = -1
  private var lastProgressAt = 0L

  init {
    setBackgroundColor(Color.BLACK)
    addView(frame, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun setResizeMode(mode: String) {
    frame.mode = when (mode) {
      "cover", "fill" -> mode
      else -> "contain"
    }
    frame.requestLayout()
  }

  fun applyProps() {
    val src = pendingSource
    val wantKey = if (src == null || src.uri.isBlank() || pendingPaused) {
      null
    } else {
      // Password participates only via hash so the key never holds the secret itself.
      "${src.uri}|${src.username}|${src.password?.hashCode()}|${src.transport}|${src.reloadKey}|$pendingSurfaceType|$pendingAudioEnabled"
    }

    if (wantKey != activeKey) {
      releasePlayer()
      activeKey = wantKey
      if (src != null && wantKey != null) {
        start(src)
      } else {
        emitStatus(if (pendingPaused) "paused" else "idle")
      }
    }

    if (pendingMuted != muted) {
      muted = pendingMuted
      player?.let { applyAudio(it) }
    }
  }

  private fun start(src: SourceRecord) {
    muted = pendingMuted
    audioEnabled = pendingAudioEnabled
    label = Redact.text(src.uri).substringAfter("://")
    val uri = try {
      withCredentials(src)
    } catch (e: Exception) {
      fail("unknown", "Invalid stream address")
      return
    }

    val renderers = DefaultRenderersFactory(context)
      .setEnableDecoderFallback(true)
      .setMediaCodecSelector(HARDWARE_VIDEO_SELECTOR)
    val loadControl = DefaultLoadControl.Builder()
      // Live CCTV: keep latency low (~0.3–1 s) while tolerating LAN jitter.
      .setBufferDurationsMs(1_000, 3_000, 250, 600)
      .setPrioritizeTimeOverSizeThresholds(true)
      .build()
    val p = ExoPlayer.Builder(context, renderers)
      .setLoadControl(loadControl)
      // Never let a stuck network thread block the UI thread for long on release.
      .setReleaseTimeoutMs(RELEASE_TIMEOUT_MS)
      .setDetachSurfaceTimeoutMs(RELEASE_TIMEOUT_MS)
      .build()

    val video = ensureVideoView(pendingSurfaceType)
    if (video is SurfaceView) p.setVideoSurfaceView(video) else p.setVideoTextureView(video as TextureView)

    val mediaSource = RtspMediaSource.Factory()
      .setForceUseRtpTcp(src.transport != "udp")
      // RTP "no packets" / UDP->TCP fallback timeout (must be well below the watchdog).
      .setTimeoutMs((connectTimeoutMs / 3).coerceIn(3_000L, 8_000L))
      // Default sockets have no connect timeout: a dead recorder could hang for minutes.
      .setSocketFactory(TimeoutSocketFactory(SOCKET_CONNECT_TIMEOUT_MS))
      .createMediaSource(MediaItem.fromUri(uri))

    p.addListener(listener)
    p.addAnalyticsListener(diagnostics)
    Log.i(TAG, "$label start transport=${src.transport} audio=$audioEnabled surface=$pendingSurfaceType")
    applyAudioTrack(p)
    applyAudio(p)
    p.setMediaSource(mediaSource)
    p.playWhenReady = true
    p.prepare()
    player = p

    startedAt = SystemClock.elapsedRealtime()
    firstFrame = false
    lastFrameCount = -1
    lastProgressAt = startedAt
    emitStatus("connecting")
    handler.postDelayed(watchdog, WATCHDOG_INTERVAL_MS)
  }

  private fun ensureVideoView(type: String): View {
    val existing = frame.videoView
    val wantSurface = type == "surface"
    if (existing != null && (existing is SurfaceView) == wantSurface) return existing
    val v: View = if (wantSurface) SurfaceView(context) else TextureView(context)
    frame.setVideoView(v)
    return v
  }

  /** Track selection is set once before prepare (RTSP only SETUPs the selected tracks). */
  private fun applyAudioTrack(p: ExoPlayer) {
    p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
      .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, !audioEnabled)
      .build()
  }

  /** Mute only changes volume + audio focus, never the track set (safe mid-stream). */
  private fun applyAudio(p: ExoPlayer) {
    p.volume = if (muted) 0f else 1f
    p.setAudioAttributes(
      AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),
      !muted,
    )
  }

  private val listener = object : Player.Listener {
    override fun onPlaybackStateChanged(playbackState: Int) {
      when (playbackState) {
        Player.STATE_BUFFERING -> emitStatus(if (firstFrame) "buffering" else "connecting")
        Player.STATE_READY -> if (firstFrame) emitStatus("playing")
        Player.STATE_ENDED -> fail("ended", "The recorder closed the stream")
        else -> Unit
      }
    }

    override fun onRenderedFirstFrame() {
      firstFrame = true
      lastProgressAt = SystemClock.elapsedRealtime()
      emitStatus("playing")
    }

    override fun onVideoSizeChanged(videoSize: VideoSize) {
      if (videoSize.width <= 0 || videoSize.height <= 0) return
      val par = videoSize.pixelWidthHeightRatio
      // CCTV encoders often signal bogus SARs (e.g. 1:2 on a 1080p stream). Only honour sane ones.
      val usablePar = if (par in 0.8f..1.5f) par else 1f
      Log.i(TAG, "$label videoSize ${videoSize.width}x${videoSize.height} par=$par (using $usablePar)")
      frame.aspect = videoSize.width * usablePar / videoSize.height
      frame.requestLayout()
      onVideoSize(mapOf("width" to videoSize.width, "height" to videoSize.height))
    }

    override fun onPlayerError(error: PlaybackException) {
      val (code, message) = ErrorClassifier.classify(error)
      Log.w(TAG, "$label error code=$code $message")
      fail(code, message)
    }
  }

  /** Credential-free diagnostics to logcat (tag CamxPlayer) for field debugging. */
  private val diagnostics = object : AnalyticsListener {
    override fun onTracksChanged(eventTime: AnalyticsListener.EventTime, tracks: Tracks) {
      for (group in tracks.groups) {
        for (i in 0 until group.length) {
          Log.i(TAG, "$label track ${describe(group.getTrackFormat(i))} selected=${group.isTrackSelected(i)} supported=${group.isTrackSupported(i)}")
        }
      }
    }

    override fun onVideoDecoderInitialized(
      eventTime: AnalyticsListener.EventTime,
      decoderName: String,
      initializedTimestampMs: Long,
      initializationDurationMs: Long,
    ) {
      Log.i(TAG, "$label decoder $decoderName init=${initializationDurationMs}ms")
    }

    override fun onVideoInputFormatChanged(
      eventTime: AnalyticsListener.EventTime,
      format: Format,
      decoderReuseEvaluation: DecoderReuseEvaluation?,
    ) {
      Log.i(TAG, "$label inputFormat ${describe(format)} reuse=${decoderReuseEvaluation?.result}")
    }

    override fun onDroppedVideoFrames(eventTime: AnalyticsListener.EventTime, droppedFrames: Int, elapsedMs: Long) {
      Log.w(TAG, "$label dropped $droppedFrames frames in ${elapsedMs}ms")
    }
  }

  private fun describe(f: Format): String =
    "${f.sampleMimeType} codecs=${f.codecs} ${f.width}x${f.height} par=${f.pixelWidthHeightRatio} fps=${f.frameRate} " +
      "init=${f.initializationData.size}x${f.initializationData.map { it.size }}"

  private val watchdog = object : Runnable {
    override fun run() {
      val p = player ?: return
      val now = SystemClock.elapsedRealtime()
      if (!firstFrame) {
        if (now - startedAt > connectTimeoutMs) {
          fail("timeout", "No video within ${connectTimeoutMs / 1000}s")
          return
        }
      } else if (!p.playWhenReady || p.playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE) {
        // Paused by the system (e.g. Assistant took audio focus): not a stall.
        lastProgressAt = now
      } else {
        val counters = p.videoDecoderCounters
        counters?.ensureUpdated()
        val frames = counters?.renderedOutputBufferCount ?: -1
        if (counters != null && now - lastStatsAt >= STATS_INTERVAL_MS) {
          lastStatsAt = now
          Log.i(
            TAG,
            "$label stats rendered=${counters.renderedOutputBufferCount} dropped=${counters.droppedBufferCount} " +
              "skipped=${counters.skippedOutputBufferCount} maxConsecDropped=${counters.maxConsecutiveDroppedBufferCount} " +
              "decoderInits=${counters.decoderInitCount}",
          )
        }
        if (frames != lastFrameCount) {
          lastFrameCount = frames
          lastProgressAt = now
        } else if (now - lastProgressAt > stallTimeoutMs) {
          fail("stall", "No new frames for ${stallTimeoutMs / 1000}s")
          return
        }
      }
      handler.postDelayed(this, WATCHDOG_INTERVAL_MS)
    }
  }

  /** Stop and report; keep activeKey so we only restart when JS asks (reloadKey). */
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
    player?.let {
      it.removeListener(listener)
      it.release()
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
    // Screen gone (navigation, unmount): free the hardware decoder immediately.
    // (isAttachedToWindow is still true inside this callback, so don't check it.)
    // A failed stream keeps its activeKey so re-attaching never retries a wrong password.
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
    private const val WATCHDOG_INTERVAL_MS = 1_000L
    private const val RELEASE_TIMEOUT_MS = 500L
    private const val STATS_INTERVAL_MS = 10_000L
    private const val TAG = "CamxPlayer"

    /**
     * Video: hardware decoders only (when any exist). On many TV chipsets the software (c2.android.*)
     * decoders render CCTV streams as garbage, and they are slow anyway. If every hardware decoder
     * is busy, init fails with a "decoder" error and JS retries / shows a snapshot instead.
     */
    private val HARDWARE_VIDEO_SELECTOR = MediaCodecSelector { mimeType, requiresSecure, requiresTunneling ->
      val all = MediaCodecSelector.DEFAULT.getDecoderInfos(mimeType, requiresSecure, requiresTunneling)
      if (!MimeTypes.isVideo(mimeType)) all else all.filter { it.hardwareAccelerated }.ifEmpty { all }
    }
    private const val SOCKET_CONNECT_TIMEOUT_MS = 5_000

    /** Inject percent-encoded credentials into the URI; Media3 strips them before sending. */
    fun withCredentials(src: SourceRecord): Uri {
      val base = Uri.parse(src.uri)
      require(base.scheme.equals("rtsp", true) || base.scheme.equals("rtsps", true)) { "bad scheme" }
      val authority = base.encodedAuthority ?: throw IllegalArgumentException("no host")
      val hostPort = authority.substringAfterLast('@')
      val user = src.username
      if (user.isNullOrEmpty()) return base.buildUpon().encodedAuthority(hostPort).build()
      // Media3 only treats userinfo as credentials when it contains ':' (even with an empty password).
      val userInfo = Uri.encode(user) + ":" + Uri.encode(src.password ?: "")
      return base.buildUpon().encodedAuthority("$userInfo@$hostPort").build()
    }
  }
}

/** Plain sockets with a bounded connect timeout (the JDK default factory has none). */
private class TimeoutSocketFactory(private val timeoutMs: Int) : SocketFactory() {
  private fun connect(address: InetSocketAddress) = Socket().apply { connect(address, timeoutMs) }
  override fun createSocket(): Socket = Socket()
  override fun createSocket(host: String, port: Int): Socket = connect(InetSocketAddress(host, port))
  override fun createSocket(host: String, port: Int, localHost: InetAddress?, localPort: Int): Socket =
    connect(InetSocketAddress(host, port))
  override fun createSocket(host: InetAddress, port: Int): Socket = connect(InetSocketAddress(host, port))
  override fun createSocket(address: InetAddress, port: Int, localAddress: InetAddress?, localPort: Int): Socket =
    connect(InetSocketAddress(address, port))
}
