import { allCameras, buildDahuaUrl, camerasForDevice, parseRtspUrl, redact, streamSourceFor } from '../rtsp';
import type { DahuaDevice, RtspDevice } from '../types';
import {
  isIPv4,
  isIPv6,
  isPrivateAddress,
  validateHost,
  validatePassword,
  validatePort,
  validateUsername,
} from '../validation';

describe('validation', () => {
  it.each(['192.168.1.108', '10.0.0.1', '0.0.0.0', '255.255.255.255'])('accepts IPv4 %s', (ip) => {
    expect(isIPv4(ip)).toBe(true);
    expect(validateHost(ip)).toBeNull();
  });

  it.each(['256.1.1.1', '1.2.3', '01.2.3.4', '1.2.3.4.5', '192.168.1.'])('rejects bad IPv4 %s', (ip) => {
    expect(isIPv4(ip)).toBe(false);
    expect(validateHost(ip)).not.toBeNull();
  });

  it.each(['::1', 'fe80::1', '2001:db8::8a2e:370:7334', '[fd00::10]', '::ffff:192.168.1.5', '1:2:3:4:5:6:7:8'])(
    'accepts IPv6 %s',
    (ip) => expect(isIPv6(ip)).toBe(true),
  );

  it.each(['1:2:3:4:5:6:7:8:9', '1::2::3', ':1', 'g::1', '1:2:3:4:5:6:7'])('rejects bad IPv6 %s', (ip) =>
    expect(isIPv6(ip)).toBe(false),
  );

  it.each(['nvr.local', 'my-nvr', 'cam1.home.arpa'])('accepts hostname %s', (h) => expect(validateHost(h)).toBeNull());

  it.each([
    'evil.com/x',
    'user:pw@host',
    '192.168.1.1?channel=2',
    'host#frag',
    'two words',
    'a\\b',
    '',
    '-bad.com',
  ])('blocks injection / invalid host %j', (h) => expect(validateHost(h)).not.toBeNull());

  it('validates ports', () => {
    expect(validatePort(554)).toBeNull();
    expect(validatePort('80')).toBeNull();
    for (const bad of [0, 65536, -1, 1.5, 'abc', '']) expect(validatePort(bad as never)).not.toBeNull();
  });

  it('validates credentials', () => {
    expect(validateUsername('admin')).toBeNull();
    expect(validateUsername('')).not.toBeNull();
    expect(validateUsername('a:b')).not.toBeNull();
    expect(validatePassword('p@ss:w/rd#?&=')).toBeNull();
    expect(validatePassword('bad\npassword')).not.toBeNull();
    expect(validatePassword('x'.repeat(129))).not.toBeNull();
  });

  it.each([
    ['192.168.0.10', true],
    ['10.20.30.40', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false],
    ['100.101.102.103', true], // Tailscale
    ['8.8.8.8', false],
    ['49.36.12.5', false],
    ['fd12::1', true],
    ['2001:4860::8888', false],
    ['nvr.local', true],
    ['nvr', true],
    ['cams.example.com', false],
  ])('isPrivateAddress(%s) = %s', (host, expected) => expect(isPrivateAddress(host)).toBe(expected));
});

describe('rtsp urls', () => {
  it('builds CP Plus / Dahua live URLs', () => {
    expect(buildDahuaUrl('192.168.1.108', 554, 3, 'main')).toBe('rtsp://192.168.1.108:554/cam/realmonitor?channel=3&subtype=0');
    expect(buildDahuaUrl('192.168.1.108', 554, 3, 'sub')).toBe('rtsp://192.168.1.108:554/cam/realmonitor?channel=3&subtype=1');
    expect(buildDahuaUrl('fd00::5', 8554, 1, 'sub')).toBe('rtsp://[fd00::5]:8554/cam/realmonitor?channel=1&subtype=1');
  });

  it('refuses to build URLs from unsafe input', () => {
    expect(() => buildDahuaUrl('evil@host', 554, 1, 'main')).toThrow();
    expect(() => buildDahuaUrl('1.2.3.4/x?', 554, 1, 'main')).toThrow();
    expect(() => buildDahuaUrl('1.2.3.4', 70000, 1, 'main')).toThrow();
    expect(() => buildDahuaUrl('1.2.3.4', 554, 0, 'main')).toThrow();
    expect(() => buildDahuaUrl('1.2.3.4', 554, 1.5, 'main')).toThrow();
  });

  it('extracts and decodes credentials from pasted URLs', () => {
    const p = parseRtspUrl('rtsp://admin:p%40ss%3Aw0rd@192.168.1.50:554/Streaming/Channels/101');
    expect(p).toEqual({
      url: 'rtsp://192.168.1.50:554/Streaming/Channels/101',
      username: 'admin',
      password: 'p@ss:w0rd',
      host: '192.168.1.50',
      port: 554,
    });
  });

  it('handles URLs without credentials, default ports and rtsps', () => {
    expect(parseRtspUrl('rtsp://cam.local/live')).toMatchObject({ url: 'rtsp://cam.local/live', port: 554, username: undefined });
    expect(parseRtspUrl('RTSPS://10.0.0.2/x').port).toBe(322);
    expect(parseRtspUrl('rtsp://user@10.0.0.2/x')).toMatchObject({ username: 'user', password: undefined });
    expect(parseRtspUrl('  rtsp://10.0.0.2:8554  ').url).toBe('rtsp://10.0.0.2:8554');
  });

  it('rejects non-RTSP or malformed URLs', () => {
    for (const bad of ['http://1.2.3.4/x', 'rtsp://', 'rtsp:///path', 'rtsp://1.2.3.4:99999/x', 'rtsp://a b/x', 'javascript:alert(1)']) {
      expect(() => parseRtspUrl(bad)).toThrow();
    }
  });

  it('redacts credentials from any text', () => {
    expect(redact('failed rtsp://admin:hunter2@10.0.0.1:554/x')).toBe('failed rtsp://***@10.0.0.1:554/x');
    expect(redact('GET /cgi?user=a&password=hunter2&x=1')).toBe('GET /cgi?user=a&password=***&x=1');
    expect(redact('no secrets here')).toBe('no secrets here');
    expect(redact('http://u:p@h https://x:y@z')).toBe('http://***@h https://***@z');
  });
});

describe('cameras', () => {
  const nvr: DahuaDevice = {
    id: 'nvr1',
    kind: 'dahua',
    name: 'Home NVR',
    host: '192.168.1.108',
    rtspPort: 554,
    httpPort: 80,
    username: 'admin',
    transport: 'tcp',
    createdAt: 0,
    channels: [
      { number: 3, name: 'Back', enabled: true },
      { number: 1, name: 'Gate', enabled: true },
      { number: 2, name: 'Hidden', enabled: false },
      { number: 4, name: '  ', enabled: true },
    ],
  };
  const ipc: RtspDevice = {
    id: 'cam9',
    kind: 'rtsp',
    name: 'Garage',
    mainUrl: 'rtsp://10.0.0.9/main',
    subUrl: 'rtsp://10.0.0.9/sub',
    username: 'u',
    transport: 'udp',
    createdAt: 0,
  };

  it('lists only enabled channels in channel order with fallback names', () => {
    expect(camerasForDevice(nvr).map((c) => [c.id, c.name])).toEqual([
      ['nvr1:1', 'Gate'],
      ['nvr1:3', 'Back'],
      ['nvr1:4', 'Camera 4'],
    ]);
    expect(allCameras([nvr, ipc])).toHaveLength(4);
  });

  it('builds stream sources without any password', () => {
    expect(streamSourceFor(nvr, 3, 'sub')).toEqual({
      uri: 'rtsp://192.168.1.108:554/cam/realmonitor?channel=3&subtype=1',
      username: 'admin',
      transport: 'tcp',
    });
    expect(streamSourceFor(ipc, 1, 'sub').uri).toBe('rtsp://10.0.0.9/sub');
    expect(streamSourceFor(ipc, 1, 'main').uri).toBe('rtsp://10.0.0.9/main');
    expect(streamSourceFor({ ...ipc, subUrl: undefined }, 1, 'sub').uri).toBe('rtsp://10.0.0.9/main');
    expect(streamSourceFor(ipc, 1, 'main')).not.toHaveProperty('password');
  });
});
