package expo.modules.rtspplayer

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class SourceRecord : Record {
  @Field var uri: String = ""
  @Field var username: String? = null
  @Field var password: String? = null
  @Field var transport: String = "tcp"
  /** Bumped by JS to force a reconnect with otherwise identical props. */
  @Field var reloadKey: Int = 0
}

class ChannelRecord : Record {
  @Field var number: Int = 0
  @Field var cameraId: String = ""
}

class RecorderRecord : Record {
  @Field var deviceId: String = ""
  @Field var host: String = ""
  @Field var httpPort: Int = 80
  @Field var username: String = ""
  @Field var password: String = ""
  @Field var channels: List<ChannelRecord> = emptyList()
}

class RtspPlayerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RtspPlayer")

    // Remote-control number keys (see RemoteKeys) + picture-in-picture changes (see Pip).
    Events("onDigit", "onPipChange", "onPopup")
    OnStartObserving("onDigit") {
      RemoteKeys.listener = { digit -> sendEvent("onDigit", mapOf("digit" to digit)) }
    }
    OnStopObserving("onDigit") {
      RemoteKeys.listener = null
    }
    OnStartObserving("onPipChange") {
      Pip.listener = { inPip -> sendEvent("onPipChange", mapOf("inPip" to inPip)) }
    }
    OnStopObserving("onPipChange") {
      Pip.listener = null
    }

    OnStartObserving("onPopup") {
      MotionPopupService.popupListener = { id -> sendEvent("onPopup", mapOf("cameraId" to id)) }
    }
    OnStopObserving("onPopup") {
      MotionPopupService.popupListener = null
    }

    // Background motion pop-up (MotionPopupService).
    Function("startMotionPopup") { recorders: List<RecorderRecord> ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      MotionPopupService.start(
        context,
        recorders.map { r ->
          MotionPopupService.Recorder(
            r.deviceId, r.host, r.httpPort, r.username, r.password,
            r.channels.map { MotionPopupService.Channel(it.number, it.cameraId) },
          )
        },
      )
    }
    Function("stopMotionPopup") {
      appContext.reactContext?.let { MotionPopupService.stop(it) }
    }
    Function("canPopUp") {
      appContext.reactContext?.let { MotionPopupService.canPopUp(it) } ?: false
    }
    Function("takePendingPopup") {
      MotionPopupService.takePendingPopup()
    }
    /** Phones/tablets: open the "Display over other apps" screen. False where it doesn't exist (most TVs). */
    Function("openOverlaySettings") {
      val context = appContext.reactContext ?: return@Function false
      val intent = android.content.Intent(
        android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        android.net.Uri.parse("package:" + context.packageName),
      ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      if (intent.resolveActivity(context.packageManager) == null) return@Function false
      context.startActivity(intent)
      true
    }
    AsyncFunction("enterPip") {
      Pip.enterNow(appContext.currentActivity)
    }.runOnQueue(Queues.MAIN)

    Function("isPipSupported") {
      Pip.isSupported(appContext.currentActivity)
    }
    /** Read synchronously so AppState "background" can be told apart from PiP. */
    Function("isInPip") {
      Pip.isActiveOrEntering()
    }
    AsyncFunction("configurePip") { enable: Boolean, width: Int, height: Int ->
      Pip.configure(appContext.currentActivity, enable, width, height)
    }.runOnQueue(Queues.MAIN)

    Function("getDecoderCapabilities") {
      DecoderCapabilities.query()
    }

    // Blocking UDP I/O: run on the IO dispatcher, not Expo's shared module queue.
    AsyncFunction("discoverOnvif") Coroutine { timeoutMs: Int ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      withContext(Dispatchers.IO) { OnvifDiscovery.discover(context, timeoutMs.coerceIn(500, 10_000)) }
    }

    View(RtspPlayerView::class) {
      Events("onStatus", "onVideoSize")

      Prop("source") { view: RtspPlayerView, source: SourceRecord? ->
        view.pendingSource = source
      }
      Prop("muted") { view: RtspPlayerView, muted: Boolean ->
        view.pendingMuted = muted
      }
      Prop("audioEnabled") { view: RtspPlayerView, enabled: Boolean ->
        view.pendingAudioEnabled = enabled
      }
      Prop("paused") { view: RtspPlayerView, paused: Boolean ->
        view.pendingPaused = paused
      }
      Prop("resizeMode") { view: RtspPlayerView, mode: String ->
        view.setResizeMode(mode)
      }
      Prop("surfaceType") { view: RtspPlayerView, type: String ->
        view.pendingSurfaceType = type
      }
      Prop("stallTimeoutMs") { view: RtspPlayerView, ms: Int ->
        view.stallTimeoutMs = ms.coerceIn(2_000, 60_000).toLong()
      }
      Prop("zoom") { view: RtspPlayerView, zoom: Double ->
        view.setZoom(zoom.toFloat())
      }
      Prop("panX") { view: RtspPlayerView, x: Double ->
        view.setPan(x.toFloat(), null)
      }
      Prop("panY") { view: RtspPlayerView, y: Double ->
        view.setPan(null, y.toFloat())
      }
      Prop("connectTimeoutMs") { view: RtspPlayerView, ms: Int ->
        view.connectTimeoutMs = ms.coerceIn(3_000, 60_000).toLong()
      }

      OnViewDidUpdateProps { view: RtspPlayerView ->
        view.applyProps()
      }

      OnViewDestroys { view: RtspPlayerView ->
        view.release()
      }
    }
  }
}
