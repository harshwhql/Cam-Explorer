import { bytesToBase64, isJpeg } from '../base64';

describe('base64', () => {
  it('matches Node Buffer for every length/remainder', () => {
    for (let len = 0; len < 300; len++) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + len) & 0xff);
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
  it('accepts ArrayBuffer', () => {
    expect(bytesToBase64(new Uint8Array([1, 2, 3]).buffer)).toBe('AQID');
  });
  it('detects JPEG magic', () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(isJpeg(new TextEncoder().encode('<html>'))).toBe(false);
    expect(isJpeg(new Uint8Array([]))).toBe(false);
  });
});
