// Input validation. Everything that ends up inside a URL goes through here so a
// crafted host/channel can never inject credentials, paths or extra parameters.

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HOSTNAME = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function isIPv4(host: string): boolean {
  return IPV4.test(host);
}

export function isIPv6(host: string): boolean {
  let h = stripBrackets(host);
  if (!h.includes(':')) return false;
  // Embedded IPv4 tail (e.g. ::ffff:192.168.1.5) counts as two hex groups.
  const lastColon = h.lastIndexOf(':');
  const tail = h.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!isIPv4(tail)) return false;
    h = `${h.slice(0, lastColon + 1)}0:0`;
  }
  const halves = h.split('::');
  if (halves.length > 2) return false;
  const hex = /^[0-9a-fA-F]{1,4}$/;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (![...left, ...right].every((g) => hex.test(g))) return false;
  const count = left.length + right.length;
  return halves.length === 2 ? count < 8 : count === 8;
}

export function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/** Returns an error message, or null when valid. */
export function validateHost(raw: string): string | null {
  const host = raw.trim();
  if (!host) return 'Enter the IP address of the recorder';
  if (/[\s@/\\?#]/.test(host)) return 'Address must not contain spaces or / @ ? # characters';
  if (isIPv4(host) || isIPv6(host)) return null;
  if (/^\d+(\.\d+)*$/.test(host)) return 'That is not a valid IPv4 address';
  if (HOSTNAME.test(host)) return null;
  return 'Enter a valid IP address or hostname';
}

export function validatePort(raw: string | number): string | null {
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > 65535) return 'Port must be a number between 1 and 65535';
  return null;
}

export function validateChannelCount(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > 256) return 'Channels must be between 1 and 256';
  return null;
}

export function validateUsername(u: string): string | null {
  if (!u) return 'Enter the username (usually "admin")';
  if (u.length > 64) return 'Username is too long';
  // ':' would break RTSP userinfo parsing; control chars are never legitimate.
  if (/[:\u0000-\u001f]/.test(u)) return 'Username must not contain ":" or control characters';
  return null;
}

export function validatePassword(p: string): string | null {
  if (p.length > 128) return 'Password is too long';
  if (/[\u0000-\u001f]/.test(p)) return 'Password must not contain control characters';
  return null;
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function inCidr(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

/**
 * True when the host is on a private / local / VPN range. A device on a public IP
 * means the recorder is exposed to the internet, which we warn about.
 */
export function isPrivateAddress(raw: string): boolean {
  const host = stripBrackets(raw.trim().toLowerCase());
  if (isIPv4(host)) {
    return (
      inCidr(host, '10.0.0.0', 8) ||
      inCidr(host, '172.16.0.0', 12) ||
      inCidr(host, '192.168.0.0', 16) ||
      inCidr(host, '127.0.0.0', 8) ||
      inCidr(host, '169.254.0.0', 16) ||
      inCidr(host, '100.64.0.0', 10) // CGNAT + Tailscale
    );
  }
  if (isIPv6(host)) {
    return host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);
  }
  // Single-label names, mDNS and common home-router domains resolve locally.
  return !host.includes('.') || /\.(local|lan|home|internal|home\.arpa|ts\.net)$/.test(host);
}
