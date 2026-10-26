/**
 * @jest-environment node
 *
 * Runs the real DahuaClient against an in-process fake CP Plus recorder that
 * implements HTTP Digest auth exactly like the firmware does.
 */
import { createHash, randomBytes } from 'crypto';
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';

import { DahuaClient, DahuaError, parseChannelTitles, parseEventChannels, parseKeyValue } from '../dahua';


/**
 * The RN jest preset replaces global fetch with a mock, so give the client a tiny real
 * fetch over node:http (supports headers, status, text() and AbortSignal).
 */
const realFetch = ((input: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) =>
  new Promise((resolve, reject) => {
    const req = request(input, { method: 'GET', headers: init?.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        resolve({
          status,
          ok: status >= 200 && status < 300,
          arrayBuffer: async () => Uint8Array.from(Buffer.concat(chunks)).buffer,
          headers: { get: (k: string) => (res.headers[k.toLowerCase()] as string | undefined) ?? null },
          text: async () => body,
        });
      });
    });
    req.on('error', reject);
    init?.signal?.addEventListener('abort', () => req.destroy(new Error('aborted')));
    req.end();
  })) as unknown as typeof fetch;

const md5 = (s: string) => createHash('md5').update(s).digest('hex');
const USER = 'admin';
const PASS = 'Cp@Plus#2026:x';
const REALM = 'Login to EXAMPLE0000000';

interface FakeOptions {
  basicOnly?: boolean;
  hang?: boolean;
  missingTitles?: boolean;
}

function startFakeNvr(opts: FakeOptions = {}) {
  const nonces = new Set<string>();
  const log: { url: string; auth?: string }[] = [];
  const routes: Record<string, string> = {
    '/cgi-bin/magicBox.cgi?action=getDeviceType': 'type=CP-UVR-0801E1-CS\r\n',
    '/cgi-bin/magicBox.cgi?action=getProductDefinition&name=MaxRemoteInputChannels': 'table.MaxRemoteInputChannels=2\r\n',
    '/cgi-bin/devVideoInput.cgi?action=getCollect': 'result=8\r\n',
    '/cgi-bin/eventManager.cgi?action=getEventIndexes&code=VideoLoss': 'channels[0]=2\r\nchannels[1]=3\r\n',
    '/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle':
      'table.ChannelTitle[0].Name=Main Gate\r\ntable.ChannelTitle[1].Name=Parking\r\ntable.ChannelTitle[2].Name=\r\n',
  };
  if (opts.missingTitles) delete routes['/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle'];

  const verify = (req: IncomingMessage): boolean => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Digest ')) return false;
    const p: Record<string, string> = {};
    for (const m of h.slice(7).matchAll(/(\w+)=(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))/g)) p[m[1]!] = m[2] ?? m[3] ?? '';
    if (!nonces.has(p.nonce!) || p.uri !== req.url || p.username !== USER) return false;
    const ha1 = md5(`${USER}:${REALM}:${PASS}`);
    const ha2 = md5(`GET:${p.uri}`);
    return p.response === md5(`${ha1}:${p.nonce}:${p.nc}:${p.cnonce}:auth:${ha2}`);
  };

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    log.push({ url: req.url ?? '', auth: req.headers.authorization });
    if (opts.hang) return; // never answer
    if (opts.basicOnly) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="NVR"' }).end();
      return;
    }
    if (!verify(req)) {
      const nonce = randomBytes(8).toString('hex');
      nonces.add(nonce);
      res
        .writeHead(401, { 'WWW-Authenticate': `Digest realm="${REALM}", qop="auth", nonce="${nonce}", opaque="5ccc069c"` })
        .end('Error');
      return;
    }
    const body = routes[req.url ?? ''];
    if (req.url?.startsWith('/cgi-bin/snapshot.cgi?channel=')) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]));
      return;
    }
    if (body === undefined) res.writeHead(404).end('Error\r\nBad Request!\r\n');
    else res.writeHead(200, { 'Content-Type': 'text/plain' }).end(body);
  });

  return new Promise<{ port: number; log: typeof log; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        log,
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections?.();
            server.close(() => r());
          }),
      });
    });
  });
}

describe('DahuaClient against a fake CP Plus recorder', () => {
  it('detects model, channel count (analog + IP) and channel names', async () => {
    const nvr = await startFakeNvr();
    try {
      const client = new DahuaClient({ host: '127.0.0.1', port: nvr.port, username: USER, password: PASS, fetchImpl: realFetch });
      const res = await client.probe();
      expect(res).toEqual({
        deviceType: 'CP-UVR-0801E1-CS',
        channelCount: 10,
        channelNames: ['Main Gate', 'Parking', ''],
        videoLossChannels: [3, 4],
      });
      // The password itself must never appear on the wire.
      expect(nvr.log.every((r) => !(r.auth ?? '').includes(PASS))).toBe(true);
    } finally {
      await nvr.close();
    }
  });

  it('wrong password: fails fast with exactly one login attempt (no lockout)', async () => {
    const nvr = await startFakeNvr();
    try {
      const client = new DahuaClient({ host: '127.0.0.1', port: nvr.port, username: USER, password: 'wrong', fetchImpl: realFetch });
      await expect(client.probe()).rejects.toMatchObject({ code: 'auth' });
      const attempts = nvr.log.filter((r) => r.auth?.startsWith('Digest'));
      expect(attempts).toHaveLength(1);
    } finally {
      await nvr.close();
    }
  });

  it('refuses to send a password over Basic auth on plain HTTP', async () => {
    const nvr = await startFakeNvr({ basicOnly: true });
    try {
      const client = new DahuaClient({ host: '127.0.0.1', port: nvr.port, username: USER, password: PASS, fetchImpl: realFetch });
      await expect(client.probe()).rejects.toMatchObject({ code: 'insecure_auth' });
      expect(nvr.log.some((r) => r.auth)).toBe(false);
    } finally {
      await nvr.close();
    }
  });

  it('still succeeds when optional endpoints are missing', async () => {
    const nvr = await startFakeNvr({ missingTitles: true });
    try {
      const client = new DahuaClient({ host: '127.0.0.1', port: nvr.port, username: USER, password: PASS, fetchImpl: realFetch });
      const res = await client.probe();
      expect(res.channelCount).toBe(10);
      expect(res.channelNames).toEqual([]);
    } finally {
      await nvr.close();
    }
  });

  it('times out on a recorder that never answers', async () => {
    const nvr = await startFakeNvr({ hang: true });
    try {
      const client = new DahuaClient({ host: '127.0.0.1', port: nvr.port, username: USER, password: PASS, timeoutMs: 300, fetchImpl: realFetch });
      await expect(client.probe()).rejects.toMatchObject({ code: 'timeout' });
    } finally {
      await nvr.close();
    }
  });

  it('reports an unreachable recorder', async () => {
    const client = new DahuaClient({ host: '127.0.0.1', port: 1, username: USER, password: PASS, timeoutMs: 2000, fetchImpl: realFetch });
    const err = await client.probe().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DahuaError);
    expect((err as DahuaError).code).toBe('unreachable');
  });
});

describe('snapshots', () => {
  it('fetches a JPEG snapshot with digest auth', async () => {
    const nvr = await startFakeNvr();
    try {
      const client = new DahuaClient({ host: '127.0.0.1', port: nvr.port, username: USER, password: PASS, fetchImpl: realFetch });
      const bytes = new Uint8Array(await client.snapshot(2));
      expect([...bytes.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      expect(nvr.log.some((r) => r.url === '/cgi-bin/snapshot.cgi?channel=2' && r.auth?.startsWith('Digest'))).toBe(true);
    } finally {
      await nvr.close();
    }
  });

  it('wrong password: one attempt, then auth error', async () => {
    const nvr = await startFakeNvr();
    try {
      const client = new DahuaClient({ host: '127.0.0.1', port: nvr.port, username: USER, password: 'bad', fetchImpl: realFetch });
      await expect(client.snapshot(1)).rejects.toMatchObject({ code: 'auth' });
      expect(nvr.log.filter((r) => r.auth).length).toBe(1);
    } finally {
      await nvr.close();
    }
  });

  it('rejects invalid channels without a request', async () => {
    const client = new DahuaClient({ host: '127.0.0.1', port: 1, username: USER, password: PASS, fetchImpl: realFetch });
    await expect(client.snapshot(0)).rejects.toMatchObject({ code: 'http' });
  });
});

describe('Dahua text parsers', () => {
  it('parses key=value bodies with CRLF and "=" in values', () => {
    expect(parseKeyValue('a=1\r\nb=x=y\r\n\r\nnoequals\r\n=bad')).toEqual({ a: '1', b: 'x=y' });
  });

  it('parses sparse channel title tables', () => {
    expect(parseChannelTitles('table.ChannelTitle[0].Name=A\r\ntable.ChannelTitle[3].Name=D\r\nother=1')).toEqual([
      'A',
      '',
      '',
      'D',
    ]);
  });

  it('parses VideoLoss event indexes into 1-based channels', () => {
    expect(parseEventChannels('channels[0]=2\r\nchannels[1]=3\r\nchannels[2]=2\r\nother=9')).toEqual([3, 4]);
    expect(parseEventChannels('Error\r\n')).toEqual([]);
  });
});
