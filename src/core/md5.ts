// Minimal MD5 (RFC 1321) over UTF-8 — needed for HTTP Digest auth, which CP Plus /
// Dahua recorders use. Pure TS so it is synchronous and unit-testable.

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4,
  11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);

function rotl(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c));
}

function utf8Bytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

export function md5(input: string): string {
  const bytes = utf8Bytes(input);
  const len = bytes.length;
  const blocks = ((len + 8) >>> 6) + 1;
  const words = new Uint32Array(blocks * 16);
  for (let i = 0; i < len; i++) words[i >> 2]! |= bytes[i]! << ((i % 4) * 8);
  words[len >> 2]! |= 0x80 << ((len % 4) * 8);
  const bitLen = len * 8;
  words[blocks * 16 - 2] = bitLen >>> 0;
  words[blocks * 16 - 1] = Math.floor(bitLen / 0x100000000);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let blk = 0; blk < blocks; blk++) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      f = (f + a + K[i]! + words[blk * 16 + g]!) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl(f, S[i]!)) | 0;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  let hex = '';
  for (const w of [a0, b0, c0, d0]) {
    for (let j = 0; j < 4; j++) hex += ((w >>> (8 * j)) & 0xff).toString(16).padStart(2, '0');
  }
  return hex;
}
