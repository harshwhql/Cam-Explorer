package expo.modules.rtspplayer

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
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

class RtspPlayerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RtspPlayer")

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
