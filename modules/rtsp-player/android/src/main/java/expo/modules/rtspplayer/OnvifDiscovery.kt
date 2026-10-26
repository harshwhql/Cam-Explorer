package expo.modules.rtspplayer

import android.content.Context
import android.net.wifi.WifiManager
import android.os.SystemClock
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.util.UUID

/**
 * ONVIF WS-Discovery: multicast a Probe on the LAN and collect ProbeMatches.
 * Returns raw address / XAddrs / scopes; parsing into names happens in TS (unit-tested).
 */
object OnvifDiscovery {
  private const val GROUP = "239.255.255.250"
  private const val PORT = 3702
  private const val MAX_RESULTS = 64

  private val XADDRS = Regex("""<(?:\w+:)?XAddrs>([^<]*)</(?:\w+:)?XAddrs>""")
  private val SCOPES = Regex("""<(?:\w+:)?Scopes[^>]*>([^<]*)</(?:\w+:)?Scopes>""")
  private val WS = Regex("""\s+""")

  private fun probe(types: String, ns: String) = """<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" $ns>
<e:Header><w:MessageID>uuid:${UUID.randomUUID()}</w:MessageID><w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header>
<e:Body><d:Probe><d:Types>$types</d:Types></d:Probe></e:Body></e:Envelope>"""

  fun discover(context: Context, timeoutMs: Int): List<Map<String, Any?>> {
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    val lock = try {
      wifi?.createMulticastLock("camexplorer-onvif")?.apply {
        setReferenceCounted(false)
        acquire()
      }
    } catch (e: Exception) {
      null
    }
    try {
      DatagramSocket().use { socket ->
        socket.soTimeout = 250
        val group = InetAddress.getByName(GROUP)
        val probes = listOf(
          probe("dn:NetworkVideoTransmitter", """xmlns:dn="http://www.onvif.org/ver10/network/wsdl""""),
          probe("tds:Device", """xmlns:tds="http://www.onvif.org/ver10/device/wsdl""""),
        )
        // UDP is lossy: send each probe twice.
        repeat(2) {
          for (p in probes) {
            val bytes = p.toByteArray(Charsets.UTF_8)
            socket.send(DatagramPacket(bytes, bytes.size, group, PORT))
          }
        }

        val results = LinkedHashMap<String, Map<String, Any?>>()
        val buf = ByteArray(65_507)
        val deadline = SystemClock.elapsedRealtime() + timeoutMs
        while (SystemClock.elapsedRealtime() < deadline && results.size < MAX_RESULTS) {
          val packet = DatagramPacket(buf, buf.size)
          try {
            socket.receive(packet)
          } catch (e: SocketTimeoutException) {
            continue
          }
          val ip = packet.address?.hostAddress ?: continue
          val xml = String(packet.data, 0, packet.length, Charsets.UTF_8)
          if (!xml.contains("ProbeMatch")) continue
          val xaddrs = XADDRS.find(xml)?.groupValues?.get(1)?.trim()?.split(WS)?.filter { it.isNotEmpty() } ?: emptyList()
          val scopes = SCOPES.find(xml)?.groupValues?.get(1)?.trim()?.split(WS)?.filter { it.isNotEmpty() } ?: emptyList()
          val prev = results[ip]
          if (prev == null || (prev["xaddrs"] as List<*>).isEmpty()) {
            results[ip] = mapOf("address" to ip, "xaddrs" to xaddrs, "scopes" to scopes)
          }
        }
        return results.values.toList()
      }
    } finally {
      try {
        lock?.release()
      } catch (e: Exception) {
        // ignore
      }
    }
  }
}
