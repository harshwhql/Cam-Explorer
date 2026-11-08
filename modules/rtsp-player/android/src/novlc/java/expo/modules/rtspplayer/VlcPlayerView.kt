package expo.modules.rtspplayer

import android.content.Context
import android.graphics.Color
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/** Built without the compatibility engine (default build): reports that once and shows nothing. */
object VlcSupport {
  const val AVAILABLE = false
}

class VlcPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onStatus by EventDispatcher()
  @Suppress("unused")
  private val onVideoSize by EventDispatcher()

  var pendingSource: SourceRecord? = null
  var pendingMuted = true
  var pendingAudioEnabled = false
  var pendingPaused = false
  var stallTimeoutMs = 8_000L
  var connectTimeoutMs = 15_000L
  private var reported = false

  init {
    setBackgroundColor(Color.BLACK)
  }

  fun setResizeMode(@Suppress("UNUSED_PARAMETER") mode: String) = Unit

  fun applyProps() {
    if (pendingSource != null && !pendingPaused && !reported) {
      reported = true
      onStatus(mapOf("state" to "error", "code" to "unsupported", "message" to "Compatibility engine not included in this build"))
    }
  }

  fun release() = Unit
}
