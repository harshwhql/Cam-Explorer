package expo.modules.rtspplayer

import androidx.media3.common.PlaybackException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.PortUnreachableException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/** Maps ExoPlayer failures onto the small set of codes the UI understands (see src/core/backoff.ts). */
object ErrorClassifier {
  // Media3 reports e.g. "DESCRIBE 401" / "Missing WWW-Authenticate header in a 401 response".
  // Some CP Plus/Dahua firmware answers 403 for a locked/no-permission account: never retry that either.
  private val AUTH = Regex("""\b(OPTIONS|DESCRIBE|SETUP|PLAY)\s+40[13]\b|WWW-Authenticate|unauthori[sz]ed""", RegexOption.IGNORE_CASE)
  private val NOT_FOUND = Regex("""\b(404|454)\b|not found""", RegexOption.IGNORE_CASE)

  fun classify(error: PlaybackException): Pair<String, String> {
    val chain = generateSequence(error as Throwable) { it.cause }.take(10).toList()
    val text = chain.joinToString(" | ") { it.message ?: it.javaClass.simpleName }
    val code = when {
      AUTH.containsMatchIn(text) -> "auth"
      NOT_FOUND.containsMatchIn(text) -> "not_found"
      chain.any { it is UnknownHostException || it is ConnectException || it is NoRouteToHostException || it is PortUnreachableException } -> "unreachable"
      chain.any { it is SocketTimeoutException } ||
        error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT -> "timeout"
      error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED -> "unreachable"
      error.errorCode in DECODER_CODES -> "decoder"
      error.errorCode in UNSUPPORTED_CODES -> "unsupported"
      else -> "unknown"
    }
    // Redact BEFORE truncating, otherwise a cut through "user:pass@" would defeat the regex.
    return code to Redact.text("${error.errorCodeName}: $text").take(300)
  }

  private val DECODER_CODES = setOf(
    PlaybackException.ERROR_CODE_DECODER_INIT_FAILED,
    PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED,
    PlaybackException.ERROR_CODE_DECODING_FAILED,
    PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES,
  )

  private val UNSUPPORTED_CODES = setOf(
    PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED,
    PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED,
    PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED,
    PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED,
    PlaybackException.ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED,
  )
}

object Redact {
  private val USERINFO = Regex("""([a-zA-Z][a-zA-Z0-9+.-]*://)[^@/\s?#]+@""")
  private val PASSWORD_PARAM = Regex("""((?:password|passwd|pwd|pass)=)[^&\s]+""", RegexOption.IGNORE_CASE)

  fun text(input: String): String = PASSWORD_PARAM.replace(USERINFO.replace(input, "$1***@"), "$1***")
}
