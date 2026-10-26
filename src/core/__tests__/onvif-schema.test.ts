import { parseProbeMatch, parseProbeMatches } from '../onvif';
import { newDeviceId, sanitizeDevice, sanitizeDevices, sanitizeSettings, unwrap, wrap } from '../schema';
import { DEFAULT_SETTINGS } from '../types';

describe('onvif discovery parsing', () => {
  const cpplus = {
    address: '192.168.1.108',
    xaddrs: ['http://192.168.1.108/onvif/device_service', 'http://[fe80::1]/onvif/device_service'],
    scopes: [
      'onvif://www.onvif.org/type/video_encoder',
      'onvif://www.onvif.org/name/CP-UNR-4K4082-V2',
      'onvif://www.onvif.org/hardware/CP-UNR-4K4082-V2',
      'onvif://www.onvif.org/location/country/example',
    ],
  };

  it('recognises CP Plus recorders', () => {
    expect(parseProbeMatch(cpplus)).toEqual({
      address: '192.168.1.108',
      httpPort: 80,
      name: 'CP-UNR-4K4082-V2',
      hardware: 'CP-UNR-4K4082-V2',
      manufacturer: undefined,
      likelyDahua: true,
    });
  });

  it('reads custom HTTP ports and decodes names', () => {
    const d = parseProbeMatch({
      address: '10.0.0.7',
      xaddrs: ['http://10.0.0.7:8080/onvif/device_service'],
      scopes: ['onvif://www.onvif.org/name/Front%20Door_Cam', 'onvif://www.onvif.org/manufacturer/Hikvision'],
    });
    expect(d).toMatchObject({ httpPort: 8080, name: 'Front Door Cam', manufacturer: 'Hikvision', likelyDahua: false });
  });

  it('dedupes and sorts by IP', () => {
    const list = parseProbeMatches([
      { address: '192.168.1.20', xaddrs: [], scopes: [] },
      { address: '192.168.1.3', xaddrs: [], scopes: [] },
      { address: '192.168.1.20', xaddrs: [], scopes: [] },
    ]);
    expect(list.map((d) => d.address)).toEqual(['192.168.1.3', '192.168.1.20']);
  });
});

describe('persisted config sanitising', () => {
  const good = {
    id: 'd1',
    kind: 'dahua',
    name: 'NVR',
    host: '192.168.1.108',
    rtspPort: 554,
    httpPort: 80,
    username: 'admin',
    transport: 'tcp',
    createdAt: 1,
    channels: [
      { number: 2, name: 'B', enabled: true },
      { number: 1, name: 'A', enabled: false },
      { number: 2, name: 'dup', enabled: true },
      { number: 0, name: 'bad', enabled: true },
    ],
  };

  it('keeps valid devices and normalises channels', () => {
    const d = sanitizeDevice(good);
    expect(d).not.toBeNull();
    expect(d!.kind === 'dahua' && d!.channels).toEqual([
      { number: 1, name: 'A', enabled: false },
      { number: 2, name: 'B', enabled: true },
    ]);
  });

  it('drops devices with injected or invalid fields', () => {
    expect(sanitizeDevice({ ...good, host: 'evil.com/x?y' })).toBeNull();
    expect(sanitizeDevice({ ...good, id: '../../etc' })).toBeNull();
    expect(sanitizeDevice({ ...good, rtspPort: 99999 })).toBeNull();
    expect(sanitizeDevice({ ...good, channels: [] })).toBeNull();
    expect(sanitizeDevice({ ...good, kind: 'nope' })).toBeNull();
    expect(sanitizeDevice('string')).toBeNull();
  });

  it('strips credentials that ended up inside stored RTSP URLs', () => {
    const d = sanitizeDevice({
      id: 'r1',
      kind: 'rtsp',
      name: 'Cam',
      username: 'u',
      transport: 'udp',
      mainUrl: 'rtsp://u:secret@10.0.0.5/live',
      subUrl: 'rtsp://u:secret@10.0.0.5/sub',
    });
    expect(JSON.stringify(d)).not.toContain('secret');
    expect(d).toMatchObject({ mainUrl: 'rtsp://10.0.0.5/live', subUrl: 'rtsp://10.0.0.5/sub', transport: 'udp' });
  });

  it('dedupes by id and skips junk', () => {
    expect(sanitizeDevices([good, good, null, 5, { ...good, id: 'd2' }]).map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(sanitizeDevices('nope')).toEqual([]);
  });

  it('clamps settings and falls back to defaults', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ layout: 7, tourIntervalSec: 1, stallTimeoutSec: 999, gridQuality: 'main' })).toMatchObject({
      layout: DEFAULT_SETTINGS.layout,
      tourIntervalSec: 5,
      stallTimeoutSec: 60,
      gridQuality: 'main',
    });
  });

  it('versioned wrap/unwrap tolerates corruption', () => {
    expect(unwrap(wrap([1, 2]))).toEqual([1, 2]);
    expect(unwrap('{broken')).toBeUndefined();
    expect(unwrap(JSON.stringify({ v: 999, data: 1 }))).toBeUndefined();
    expect(unwrap(null)).toBeUndefined();
  });

  it('generates storage-safe unique ids', () => {
    const ids = new Set(Array.from({ length: 500 }, newDeviceId));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });
});
