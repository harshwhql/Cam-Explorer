package expo.modules.rtspplayer

import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Minimal HTTP GET with Digest auth (MD5, qop=auth) for CP Plus / Dahua CGI — the native
 * twin of src/core/digest.ts + dahua.ts, used by the background motion service.
 * Answers one challenge per request and never retries a failed login.
 */
object DigestHttp {
  class AuthFailed : Exception("Wrong username or password")

  data class Response(val code: Int, val body: String)

  private val random = SecureRandom()
  private val PARAM = Regex("""(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))""")

  fun get(url: String, user: String, pass: String, timeoutMs: Int): Response {
    val first = request(url, null, timeoutMs)
    if (first.code != 401) return first.toResponse()
    val header = first.wwwAuthenticate ?: throw AuthFailed()
    val auth = authorization(header, user, pass, URL(url)) ?: throw AuthFailed() // Basic-only: refuse
    val second = request(url, auth, timeoutMs)
    if (second.code == 401) throw AuthFailed()
    return second.toResponse()
  }

  private class Raw(val code: Int, val body: String, val wwwAuthenticate: String?) {
    fun toResponse() = Response(code, body)
  }

  private fun request(url: String, authorization: String?, timeoutMs: Int): Raw {
    val conn = URL(url).openConnection() as HttpURLConnection
    try {
      conn.connectTimeout = timeoutMs
      conn.readTimeout = timeoutMs
      conn.instanceFollowRedirects = false
      conn.useCaches = false
      authorization?.let { conn.setRequestProperty("Authorization", it) }
      val code = conn.responseCode
      val stream = if (code in 200..299) conn.inputStream else conn.errorStream
      val body = stream?.bufferedReader()?.use { it.readText().take(64 * 1024) } ?: ""
      return Raw(code, body, conn.getHeaderField("WWW-Authenticate"))
    } finally {
      conn.disconnect()
    }
  }

  private fun md5(s: String): String =
    MessageDigest.getInstance("MD5").digest(s.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

  private fun authorization(header: String, user: String, pass: String, url: URL): String? {
    val start = header.indexOf("Digest", ignoreCase = true)
    if (start < 0) return null
    val params = PARAM.findAll(header.substring(start + 6)).associate { m ->
      m.groupValues[1].lowercase() to (m.groups[2]?.value?.replace(Regex("""\\(.)"""), "$1") ?: m.groupValues[3])
    }
    val realm = params["realm"] ?: return null
    val nonce = params["nonce"] ?: return null
    val algorithm = params["algorithm"] ?: "MD5"
    if (!algorithm.equals("MD5", true) && !algorithm.equals("MD5-sess", true)) return null
    val uri = url.file.ifEmpty { "/" }
    val cnonce = ByteArray(8).also { random.nextBytes(it) }.joinToString("") { "%02x".format(it) }
    val nc = "00000001"
    var ha1 = md5("$user:$realm:$pass")
    if (algorithm.equals("MD5-sess", true)) ha1 = md5("$ha1:$nonce:$cnonce")
    val ha2 = md5("GET:$uri")
    val qopAuth = params["qop"]?.split(',')?.any { it.trim().equals("auth", true) } == true
    val response = if (qopAuth) md5("$ha1:$nonce:$nc:$cnonce:auth:$ha2") else md5("$ha1:$nonce:$ha2")
    fun q(v: String) = "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
    val parts = mutableListOf(
      "username=${q(user)}", "realm=${q(realm)}", "nonce=${q(nonce)}", "uri=${q(uri)}",
      "algorithm=$algorithm", "response=${q(response)}",
    )
    if (qopAuth) parts += listOf("qop=auth", "nc=$nc", "cnonce=${q(cnonce)}")
    params["opaque"]?.let { parts += "opaque=${q(it)}" }
    return "Digest " + parts.joinToString(", ")
  }

  /** `channels[0]=2` lines → 1-based channel numbers. */
  fun parseEventChannels(body: String): Set<Int> =
    body.lineSequence()
      .mapNotNull { Regex("""^channels\[\d+]=(\d+)""").find(it.trim())?.groupValues?.get(1)?.toIntOrNull() }
      .filter { it in 0..255 }
      .map { it + 1 }
      .toSet()
}
