// Defensive (de)serialisation of persisted config. Anything malformed is dropped rather
// than crashing the app at boot — the app must always come up.
import { GRID_LAYOUTS } from './layout';
import { DEFAULT_SETTINGS } from './types';
import type { ChannelConfig, Device, GridLayout, Settings, StreamQuality, Transport } from './types';
import { validateHost, validatePort, validateUsername } from './validation';
import { parseRtspUrl } from './rtsp';

export const STORAGE_VERSION = 1;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const int = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isInteger(v) ? v : fallback);
const transport = (v: unknown): Transport => (v === 'udp' ? 'udp' : 'tcp');
const quality = (v: unknown, fallback: StreamQuality): StreamQuality => (v === 'main' || v === 'sub' ? v : fallback);
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function sanitizeChannels(v: unknown): ChannelConfig[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<number>();
  const out: ChannelConfig[] = [];
  for (const c of v) {
    if (!isObj(c)) continue;
    const number = int(c.number, -1);
    if (number < 1 || number > 256 || seen.has(number)) continue;
    seen.add(number);
    out.push({ number, name: str(c.name).slice(0, 64), enabled: c.enabled !== false });
  }
  return out.sort((a, b) => a.number - b.number);
}

export function sanitizeDevice(raw: unknown): Device | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!SAFE_ID.test(id)) return null;
  const base = {
    id,
    name: str(raw.name, 'Recorder').slice(0, 64) || 'Recorder',
    username: str(raw.username),
    transport: transport(raw.transport),
    createdAt: int(raw.createdAt, 0),
  };
  if (base.username && validateUsername(base.username)) return null;

  if (raw.kind === 'dahua') {
    const host = str(raw.host).trim();
    const rtspPort = int(raw.rtspPort, 554);
    const httpPort = int(raw.httpPort, 80);
    if (validateHost(host) || validatePort(rtspPort) || validatePort(httpPort)) return null;
    const channels = sanitizeChannels(raw.channels);
    if (channels.length === 0) return null;
    return { ...base, kind: 'dahua', host, rtspPort, httpPort, channels };
  }
  if (raw.kind === 'rtsp') {
    try {
      const main = parseRtspUrl(str(raw.mainUrl));
      const subRaw = str(raw.subUrl);
      const sub = subRaw ? parseRtspUrl(subRaw) : undefined;
      // Never keep credentials in plain config, even if an old build stored them.
      return { ...base, kind: 'rtsp', mainUrl: main.url, subUrl: sub?.url };
    } catch {
      return null;
    }
  }
  return null;
}

export function sanitizeDevices(raw: unknown): Device[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Device[] = [];
  for (const r of raw) {
    const d = sanitizeDevice(r);
    if (d && !seen.has(d.id)) {
      seen.add(d.id);
      out.push(d);
    }
  }
  return out;
}

export function sanitizeSettings(raw: unknown): Settings {
  if (!isObj(raw)) return { ...DEFAULT_SETTINGS };
  const layout = GRID_LAYOUTS.includes(raw.layout as GridLayout) ? (raw.layout as GridLayout) : DEFAULT_SETTINGS.layout;
  const clamp = (v: unknown, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, int(v, d)));
  return {
    layout,
    page: clamp(raw.page, 0, 1000, 0),
    gridQuality: quality(raw.gridQuality, DEFAULT_SETTINGS.gridQuality),
    fullscreenQuality: quality(raw.fullscreenQuality, DEFAULT_SETTINGS.fullscreenQuality),
    showLabels: typeof raw.showLabels === 'boolean' ? raw.showLabels : DEFAULT_SETTINGS.showLabels,
    tourEnabled: typeof raw.tourEnabled === 'boolean' ? raw.tourEnabled : DEFAULT_SETTINGS.tourEnabled,
    tourIntervalSec: clamp(raw.tourIntervalSec, 5, 300, DEFAULT_SETTINGS.tourIntervalSec),
    stallTimeoutSec: clamp(raw.stallTimeoutSec, 3, 60, DEFAULT_SETTINGS.stallTimeoutSec),
  };
}

/** Wrap persisted payloads with a version so future migrations are possible. */
export function wrap<T>(data: T): string {
  return JSON.stringify({ v: STORAGE_VERSION, data });
}

export function unwrap(json: string | null): unknown {
  if (!json) return undefined;
  try {
    const parsed: unknown = JSON.parse(json);
    if (isObj(parsed) && parsed.v === STORAGE_VERSION) return parsed.data;
    return undefined;
  } catch {
    return undefined;
  }
}

export function newDeviceId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
