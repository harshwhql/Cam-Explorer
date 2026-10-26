import type { Camera, DahuaDevice, Device, RtspDevice, StreamQuality, StreamSource } from './types';
import { isIPv6, stripBrackets, validateHost, validatePort } from './validation';

export function formatHostPort(host: string, port: number): string {
  const h = stripBrackets(host.trim());
  return isIPv6(h) ? `[${h}]:${port}` : `${h}:${port}`;
}

/** CP Plus / Dahua live URL. subtype 0 = main stream, 1 = sub stream. */
export function buildDahuaUrl(host: string, port: number, channel: number, quality: StreamQuality): string {
  const hostErr = validateHost(host);
  if (hostErr) throw new Error(hostErr);
  const portErr = validatePort(port);
  if (portErr) throw new Error(portErr);
  if (!Number.isInteger(channel) || channel < 1) throw new Error('Invalid channel');
  const subtype = quality === 'main' ? 0 : 1;
  return `rtsp://${formatHostPort(host, port)}/cam/realmonitor?channel=${channel}&subtype=${subtype}`;
}

export interface ParsedRtspUrl {
  /** URL with any user:password@ removed. */
  url: string;
  username?: string;
  password?: string;
  host: string;
  port: number;
}

const RTSP_RE = /^(rtsps?):\/\/(?:([^@/?#]*)@)?(\[[^\]]+\]|[^:/?#]+)(?::(\d+))?([/?#].*)?$/i;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Parse a user-pasted RTSP URL. Credentials embedded in the URL are split out so they
 * can be stored encrypted instead of in plain config.
 * Throws with a human-readable message when the URL is unusable.
 */
export function parseRtspUrl(input: string): ParsedRtspUrl {
  const raw = input.trim();
  const m = RTSP_RE.exec(raw);
  if (!m) throw new Error('URL must start with rtsp:// and include a host');
  const [, scheme, userInfo, host = '', portStr, rest = ''] = m;
  if (/\s/.test(raw)) throw new Error('URL must not contain spaces');
  const hostErr = validateHost(host);
  if (hostErr) throw new Error(hostErr);
  const port = portStr ? Number(portStr) : scheme!.toLowerCase() === 'rtsps' ? 322 : 554;
  const portErr = validatePort(port);
  if (portErr) throw new Error(portErr);

  let username: string | undefined;
  let password: string | undefined;
  if (userInfo !== undefined && userInfo !== '') {
    const idx = userInfo.indexOf(':');
    username = safeDecode(idx === -1 ? userInfo : userInfo.slice(0, idx));
    password = idx === -1 ? undefined : safeDecode(userInfo.slice(idx + 1));
  }
  const url = `${scheme!.toLowerCase()}://${host}${portStr ? `:${portStr}` : ''}${rest}`;
  return { url, username, password, host: stripBrackets(host), port };
}

/** Remove credentials from any text (error messages, logs) before it is shown or logged. */
export function redact(text: string): string {
  return text
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/\s?#]+@/gi, '$1***@')
    .replace(/((?:password|passwd|pwd|pass)=)[^&\s]+/gi, '$1***');
}

export function camerasForDevice(device: Device): Camera[] {
  if (device.kind === 'rtsp') {
    return [{ id: `${device.id}:1`, deviceId: device.id, deviceName: device.name, name: device.name, channel: 1 }];
  }
  return device.channels
    .filter((c) => c.enabled)
    .sort((a, b) => a.number - b.number)
    .map((c) => ({
      id: `${device.id}:${c.number}`,
      deviceId: device.id,
      deviceName: device.name,
      name: c.name.trim() || `Camera ${c.number}`,
      channel: c.number,
    }));
}

export function allCameras(devices: Device[]): Camera[] {
  return devices.flatMap(camerasForDevice);
}

function rtspUri(device: RtspDevice, quality: StreamQuality): string {
  return quality === 'sub' && device.subUrl ? device.subUrl : device.mainUrl;
}

function dahuaUri(device: DahuaDevice, channel: number, quality: StreamQuality): string {
  return buildDahuaUrl(device.host, device.rtspPort, channel, quality);
}

/** Build the credential-free stream source for a camera. Password is added by the caller. */
export function streamSourceFor(device: Device, channel: number, quality: StreamQuality): StreamSource {
  const uri = device.kind === 'dahua' ? dahuaUri(device, channel, quality) : rtspUri(device, quality);
  return { uri, username: device.username || undefined, transport: device.transport };
}
