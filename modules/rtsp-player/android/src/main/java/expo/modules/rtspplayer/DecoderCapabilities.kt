package expo.modules.rtspplayer

import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.os.Build

/**
 * Reports what the device's video decoders can do, so the UI never starts more
 * simultaneous streams than the TV's hardware decoder can handle.
 */
object DecoderCapabilities {
  fun query(): Map<String, Any?> {
    val infos = try {
      MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.toList()
    } catch (e: Exception) {
      emptyList()
    }
    return mapOf(
      "h264" to best(infos, "video/avc"),
      "h265" to best(infos, "video/hevc"),
      "manufacturer" to Build.MANUFACTURER,
      "model" to Build.MODEL,
      "sdkInt" to Build.VERSION.SDK_INT,
    )
  }

  private fun best(infos: List<MediaCodecInfo>, mime: String): Map<String, Any?>? {
    val candidates = infos.filter { info ->
      !info.isEncoder && info.supportedTypes.any { it.equals(mime, ignoreCase = true) }
    }
    if (candidates.isEmpty()) return null
    val pool = candidates.filter { isHardware(it) }.ifEmpty { candidates }
    val pick = pool.maxByOrNull { safeInstances(it, mime) } ?: return null
    val caps = try {
      pick.getCapabilitiesForType(mime)
    } catch (e: Exception) {
      return null
    }
    val video = caps.videoCapabilities
    return mapOf(
      "name" to pick.name,
      "hardware" to isHardware(pick),
      "maxInstances" to safeInstances(pick, mime),
      "maxWidth" to video?.supportedWidths?.upper,
      "maxHeight" to video?.supportedHeights?.upper,
    )
  }

  private fun safeInstances(info: MediaCodecInfo, mime: String): Int = try {
    info.getCapabilitiesForType(mime).maxSupportedInstances
  } catch (e: Exception) {
    1
  }

  private fun isHardware(info: MediaCodecInfo): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return info.isHardwareAccelerated
    val n = info.name.lowercase()
    return !(n.startsWith("omx.google.") || n.startsWith("c2.android.") || n.contains(".sw."))
  }
}
