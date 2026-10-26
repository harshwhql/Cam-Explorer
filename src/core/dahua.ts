// CP Plus / Dahua HTTP API client (CGI). Used to auto-detect a recorder's model,
// channel count and channel names so the user doesn't have to type them (painful with a TV remote).
import { buildDigestAuthorization, offersBasicOnly, parseWwwAuthenticate, randomCnonce } from './digest';
import { formatHostPort, redact } from './rtsp';

export type DahuaErrorCode = 'auth' | 'insecure_auth' | 'unreachable' | 'timeout' | 'http' | 'not_dahua';

export class DahuaError extends Error {
  constructor(
    public readonly code: DahuaErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DahuaError';
  }
}

export interface DahuaClientOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  scheme?: 'http' | 'https';
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  cnonce?: () => string;
}

export interface DahuaProbeResult {
  deviceType?: string;
  channelCount?: number;
  channelNames: string[];
  /** 1-based channels reporting video loss (nothing connected / camera offline). */
  videoLossChannels: number[];
}

export function parseKeyValue(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

/** `channels[0]=2` lines → 1-based channel numbers [3]. */
export function parseEventChannels(text: string): number[] {
  const out = new Set<number>();
  for (const [key, value] of Object.entries(parseKeyValue(text))) {
    if (!/^channels\[\d+\]$/.test(key)) continue;
    const n = Number.parseInt(value, 10);
    if (Number.isInteger(n) && n >= 0 && n < 256) out.add(n + 1);
  }
  return [...out].sort((a, b) => a - b);
}

/** `table.ChannelTitle[0].Name=Gate` → names[0] = 'Gate' (index 0 = channel 1). */
export function parseChannelTitles(text: string): string[] {
  const names: string[] = [];
  for (const [key, value] of Object.entries(parseKeyValue(text))) {
    const m = /^table\.ChannelTitle\[(\d+)\]\.Name$/.exec(key);
    if (m) names[Number(m[1])] = value;
  }
  return Array.from(names, (n) => n ?? '');
}

function toInt(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export class DahuaClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly cnonce: () => string;
  private nc = 0;

  constructor(private readonly opts: DahuaClientOptions) {
    this.base = `${opts.scheme ?? 'http'}://${formatHostPort(opts.host, opts.port)}`;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 6000;
    this.cnonce = opts.cnonce ?? randomCnonce;
  }

  private async fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { method: 'GET', headers, signal: ctrl.signal });
    } catch (e) {
      if (ctrl.signal.aborted) throw new DahuaError('timeout', 'Recorder did not respond in time');
      throw new DahuaError('unreachable', `Cannot reach recorder: ${redact(String((e as Error)?.message ?? e))}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET a CGI path as text. */
  async get(path: string): Promise<string> {
    return (await this.fetchAuthed(path)).text();
  }

  /** GET a CGI path as bytes (e.g. JPEG snapshots). */
  async getBytes(path: string): Promise<ArrayBuffer> {
    return (await this.fetchAuthed(path)).arrayBuffer();
  }

  /** Current JPEG frame of a channel (1-based) — no video decoder needed to show it. */
  async snapshot(channel: number): Promise<ArrayBuffer> {
    if (!Number.isInteger(channel) || channel < 1 || channel > 256) throw new DahuaError('http', 'Invalid channel');
    return this.getBytes(`/cgi-bin/snapshot.cgi?channel=${channel}`);
  }

  /**
   * GET answering a fresh Digest challenge once. Never retries a failed login, and never
   * reuses nonces (a stale-nonce failure could count towards the recorder's lockout).
   */
  private async fetchAuthed(path: string): Promise<Response> {
    const url = this.base + path;
    let res = await this.fetchWithTimeout(url, {});
    if (res.status === 401) {
      const header = res.headers.get('www-authenticate');
      const challenge = parseWwwAuthenticate(header);
      if (!challenge) {
        if (offersBasicOnly(header) && (this.opts.scheme ?? 'http') === 'http') {
          throw new DahuaError(
            'insecure_auth',
            'Recorder only offers Basic login over plain HTTP. Refusing to send the password unencrypted.',
          );
        }
        throw new DahuaError('not_dahua', 'Unsupported login method');
      }
      this.nc += 1;
      const authorization = buildDigestAuthorization({
        username: this.opts.username,
        password: this.opts.password,
        method: 'GET',
        uri: path,
        challenge,
        cnonce: this.cnonce(),
        nc: this.nc,
      });
      res = await this.fetchWithTimeout(url, { Authorization: authorization });
      if (res.status === 401) throw new DahuaError('auth', 'Wrong username or password');
    }
    if (res.status === 404) throw new DahuaError('not_dahua', 'This device does not look like a CP Plus/Dahua recorder');
    if (!res.ok) throw new DahuaError('http', `Recorder returned HTTP ${res.status}`);
    return res;
  }

  /**
   * Detect model + channels. Login failures abort immediately (CP Plus locks the account
   * after a handful of bad attempts); other failures degrade gracefully.
   */
  async probe(): Promise<DahuaProbeResult> {
    const type = parseKeyValue(await this.get('/cgi-bin/magicBox.cgi?action=getDeviceType'));
    const deviceType = type.type;

    const optional = async (path: string): Promise<string | undefined> => {
      try {
        return await this.get(path);
      } catch (e) {
        if (e instanceof DahuaError && (e.code === 'auth' || e.code === 'insecure_auth')) throw e;
        return undefined;
      }
    };

    const remoteTxt = await optional('/cgi-bin/magicBox.cgi?action=getProductDefinition&name=MaxRemoteInputChannels');
    const remote = toInt(remoteTxt ? parseKeyValue(remoteTxt)['table.MaxRemoteInputChannels'] : undefined);
    const collectTxt = await optional('/cgi-bin/devVideoInput.cgi?action=getCollect');
    const local = toInt(collectTxt ? parseKeyValue(collectTxt).result : undefined);
    const titlesTxt = await optional('/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle');
    const channelNames = titlesTxt ? parseChannelTitles(titlesTxt) : [];

    // Channels with no camera (or a dead one) raise a VideoLoss event; those get hidden by default.
    const lossTxt = await optional('/cgi-bin/eventManager.cgi?action=getEventIndexes&code=VideoLoss');
    const videoLossChannels = lossTxt ? parseEventChannels(lossTxt) : [];

    const total = (local ?? 0) + (remote ?? 0);
    const channelCount = total > 0 ? total : channelNames.length > 0 ? channelNames.length : undefined;
    return { deviceType, channelCount, channelNames, videoLossChannels };
  }
}
