import { createHash } from 'crypto';

import { buildDigestAuthorization, offersBasicOnly, parseWwwAuthenticate } from '../digest';
import { md5 } from '../md5';

describe('md5 (RFC 1321 test suite)', () => {
  it.each([
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['1234567890'.repeat(8), '57edf4a22be3c955ac49da2e2107b67a'],
  ])('md5(%j)', (input, expected) => {
    expect(md5(input)).toBe(expected);
  });

  it('matches Node crypto for UTF-8 input of every length around block boundaries', () => {
    const alphabet = ['a', 'Z', '9', '@', ':', 'é', 'पा', '🔒'];
    for (let len = 0; len <= 140; len++) {
      let s = '';
      for (let i = 0; i < len; i++) s += alphabet[(i * 7 + len) % alphabet.length];
      expect(md5(s)).toBe(createHash('md5').update(s, 'utf8').digest('hex'));
    }
  });
});

describe('digest auth', () => {
  it('matches the RFC 2617 §3.5 example', () => {
    const challenge = parseWwwAuthenticate(
      'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
    );
    expect(challenge).not.toBeNull();
    const header = buildDigestAuthorization({
      username: 'Mufasa',
      password: 'Circle Of Life',
      method: 'GET',
      uri: '/dir/index.html',
      challenge: challenge!,
      cnonce: '0a4f113b',
      nc: 1,
    });
    expect(header).toContain('response="6629fae49393a05397450978507c4ef1"');
    expect(header).toContain('qop=auth');
    expect(header).toContain('nc=00000001');
    expect(header).toContain('opaque="5ccc069c403ebaf9f0171e9517f40e41"');
  });

  it('parses a Dahua-style challenge', () => {
    const c = parseWwwAuthenticate('Digest realm="Login to EXAMPLE0000000", qop="auth", nonce="1738542095", opaque="a8f2d1"');
    expect(c).toEqual({ realm: 'Login to EXAMPLE0000000', nonce: '1738542095', qop: 'auth', opaque: 'a8f2d1', algorithm: undefined });
  });

  it('ignores a Basic challenge sent in the same header', () => {
    const c = parseWwwAuthenticate('Digest realm="r1", nonce="n1", qop="auth", Basic realm="other"');
    expect(c?.realm).toBe('r1');
  });

  it('works without qop (RFC 2069 style, used by many RTSP/HTTP cameras)', () => {
    const c = parseWwwAuthenticate('Digest realm="cam", nonce="abc"')!;
    const h = buildDigestAuthorization({ username: 'admin', password: 'x', method: 'GET', uri: '/', challenge: c, cnonce: 'c' });
    const ha1 = md5('admin:cam:x');
    const ha2 = md5('GET:/');
    expect(h).toContain(`response="${md5(`${ha1}:abc:${ha2}`)}"`);
    expect(h).not.toContain('qop=');
  });

  it('supports MD5-sess', () => {
    const c = parseWwwAuthenticate('Digest realm="r", nonce="n", qop="auth", algorithm=MD5-sess')!;
    const h = buildDigestAuthorization({ username: 'u', password: 'p', method: 'GET', uri: '/x', challenge: c, cnonce: 'cn', nc: 2 });
    const ha1 = md5(`${md5('u:r:p')}:n:cn`);
    expect(h).toContain(`response="${md5(`${ha1}:n:00000002:cn:auth:${md5('GET:/x')}`)}"`);
  });

  it('escapes quotes in the username', () => {
    const c = parseWwwAuthenticate('Digest realm="r", nonce="n"')!;
    const h = buildDigestAuthorization({ username: 'a"b', password: 'p', method: 'GET', uri: '/', challenge: c, cnonce: 'x' });
    expect(h).toContain('username="a\\"b"');
  });

  it('rejects unsupported algorithms instead of silently sending a wrong hash', () => {
    const c = parseWwwAuthenticate('Digest realm="r", nonce="n", algorithm=SHA-512-256')!;
    expect(() =>
      buildDigestAuthorization({ username: 'u', password: 'p', method: 'GET', uri: '/', challenge: c, cnonce: 'x' }),
    ).toThrow(/Unsupported/);
  });

  it('returns null for non-digest or malformed headers', () => {
    expect(parseWwwAuthenticate(null)).toBeNull();
    expect(parseWwwAuthenticate('Basic realm="x"')).toBeNull();
    expect(parseWwwAuthenticate('Digest realm="x"')).toBeNull(); // no nonce
  });

  it('detects Basic-only challenges', () => {
    expect(offersBasicOnly('Basic realm="x"')).toBe(true);
    expect(offersBasicOnly('Digest realm="x", nonce="y"')).toBe(false);
    expect(offersBasicOnly(null)).toBe(false);
  });
});
