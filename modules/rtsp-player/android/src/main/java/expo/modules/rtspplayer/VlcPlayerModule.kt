package expo.modules.rtspplayer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Compatibility (libVLC) engine — a real player only in builds made with -Pcamx.vlc=true. */
class VlcPlayerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RtspPlayerVlc")

    Function("isAvailable") {
      VlcSupport.AVAILABLE
    }

    View(VlcPlayerView::class) {
      Events("onStatus", "onVideoSize")

      Prop("source") { view: VlcPlayerView, source: SourceRecord? ->
        view.pendingSource = source
      }
      Prop("muted") { view: VlcPlayerView, muted: Boolean ->
        view.pendingMuted = muted
      }
      Prop("audioEnabled") { view: VlcPlayerView, enabled: Boolean ->
        view.pendingAudioEnabled = enabled
      }
      Prop("paused") { view: VlcPlayerView, paused: Boolean ->
        view.pendingPaused = paused
      }
      Prop("resizeMode") { view: VlcPlayerView, mode: String ->
        view.setResizeMode(mode)
      }
      Prop("stallTimeoutMs") { view: VlcPlayerView, ms: Int ->
        view.stallTimeoutMs = ms.coerceIn(2_000, 60_000).toLong()
      }
      Prop("connectTimeoutMs") { view: VlcPlayerView, ms: Int ->
        view.connectTimeoutMs = ms.coerceIn(3_000, 60_000).toLong()
      }

      OnViewDidUpdateProps { view: VlcPlayerView ->
        view.applyProps()
      }
      OnViewDestroys { view: VlcPlayerView ->
        view.release()
      }
    }
  }
}
