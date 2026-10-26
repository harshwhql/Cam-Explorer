// Turns raw WS-Discovery matches into something a person can pick from a list.
import { isIPv4 } from './validation';

export interface RawProbeMatch {
  address: string;
  xaddrs: string[];
  scopes: string[];
}

export interface DiscoveredDevice {
  address: string;
  httpPort: number;
  name?: string;
  hardware?: string;
  manufacturer?: string;
  /** Looks like CP Plus / Dahua (same protocol family) → use the CP Plus setup flow. */
  likelyDahua: boolean;
}

function scopeValue(scopes: string[], key: string): string | undefined {
  const prefix = `onvif://www.onvif.org/${key}/`;
  const hit = scopes.find((s) => s.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!hit) return undefined;
  const raw = hit.slice(prefix.length);
  try {
    return decodeURIComponent(raw).replace(/_/g, ' ').trim() || undefined;
  } catch {
    return raw;
  }
}

const XADDR_RE = /^https?:\/\/(\[[^\]]+\]|[^/:]+)(?::(\d+))?/i;

const DAHUA_HINT = /(dahua|cp[\s-]?plus|\bdh-|\bcp-[a-z]|imou|amcrest|lorex)/i;

export function parseProbeMatch(m: RawProbeMatch): DiscoveredDevice {
  let address = m.address;
  let httpPort = 80;
  for (const x of m.xaddrs) {
    const hit = XADDR_RE.exec(x);
    if (hit && isIPv4(hit[1]!)) {
      address = hit[1]!;
      httpPort = hit[2] ? Number(hit[2]) : x.toLowerCase().startsWith('https') ? 443 : 80;
      break;
    }
  }
  const name = scopeValue(m.scopes, 'name');
  const hardware = scopeValue(m.scopes, 'hardware');
  const manufacturer = scopeValue(m.scopes, 'manufacturer') ?? scopeValue(m.scopes, 'mfr');
  const likelyDahua = DAHUA_HINT.test([name, hardware, manufacturer].filter(Boolean).join(' '));
  return { address, httpPort, name, hardware, manufacturer, likelyDahua };
}

function ipSortKey(ip: string): number {
  return isIPv4(ip) ? ip.split('.').reduce((a, o) => a * 256 + Number(o), 0) : Number.MAX_SAFE_INTEGER;
}

export function parseProbeMatches(matches: RawProbeMatch[]): DiscoveredDevice[] {
  const byAddr = new Map<string, DiscoveredDevice>();
  for (const m of matches) {
    const d = parseProbeMatch(m);
    if (!byAddr.has(d.address)) byAddr.set(d.address, d);
  }
  return [...byAddr.values()].sort((a, b) => ipSortKey(a.address) - ipSortKey(b.address));
}
