import { flushDigits, pushDigit } from '../digits';
import { NO_ZOOM, clampZoom, dragPan, panBy, pinchZoom, stepZoom } from '../zoom';

describe('number keys', () => {
  it('commits single digits at once when no 2-digit number is possible', () => {
    expect(pushDigit('', 3, 9)).toEqual({ buffer: '', commit: 3 });
  });

  it('waits for a second digit when one is possible, then commits', () => {
    const a = pushDigit('', 1, 16);
    expect(a).toEqual({ buffer: '1' });
    expect(pushDigit(a.buffer, 2, 16)).toEqual({ buffer: '', commit: 12 });
    expect(flushDigits(a.buffer, 16)).toEqual({ buffer: '', commit: 1 });
  });

  it('starts over when the number would be too big', () => {
    expect(pushDigit('1', 9, 16)).toEqual({ buffer: '', commit: 9 });
    expect(pushDigit('2', 0, 16)).toEqual({ buffer: '' });
  });

  it('ignores leading zeros, invalid input and out-of-range numbers', () => {
    expect(pushDigit('', 0, 9)).toEqual({ buffer: '' });
    expect(pushDigit('', 11, 9)).toEqual({ buffer: '' });
    expect(pushDigit('', 5, 0)).toEqual({ buffer: '' });
    expect(flushDigits('', 9)).toEqual({ buffer: '' });
  });
});

describe('zoom', () => {
  it('steps 1 → 2 → 3 → 4 and back, keeping pan', () => {
    let z = stepZoom(NO_ZOOM, 1);
    expect(z.zoom).toBe(2);
    z = panBy(z, 0.5, 0);
    z = stepZoom(stepZoom(z, 1), 1);
    expect(z).toEqual({ zoom: 4, x: 0.5, y: 0 });
    expect(stepZoom(z, 1).zoom).toBe(4);
    expect(stepZoom(stepZoom(stepZoom(z, -1), -1), -1)).toEqual(NO_ZOOM);
  });

  it('cannot pan when not zoomed; pan is clamped to the edges', () => {
    expect(panBy(NO_ZOOM, 1, 1)).toBe(NO_ZOOM);
    expect(panBy({ zoom: 2, x: 0.9, y: -0.9 }, 0.5, -0.5)).toEqual({ zoom: 2, x: 1, y: -1 });
  });

  it('pinch scales relative to the gesture start and clamps to 1..4', () => {
    expect(pinchZoom(NO_ZOOM, 100, 250).zoom).toBe(2.5);
    expect(pinchZoom({ zoom: 3, x: 0, y: 0 }, 100, 1000).zoom).toBe(4);
    expect(pinchZoom({ zoom: 2, x: 0.3, y: 0 }, 100, 40)).toEqual(NO_ZOOM);
  });

  it('dragging moves the picture with the finger', () => {
    // 2× on a 1000px-wide view: 500px of overflow per side → 250px drag = 0.5 pan the other way
    expect(dragPan({ zoom: 2, x: 0, y: 0 }, 250, 0, 1000, 500)).toEqual({ zoom: 2, x: -0.5, y: 0 });
    expect(dragPan(NO_ZOOM, 250, 0, 1000, 500)).toBe(NO_ZOOM);
  });

  it('sanitises bad input', () => {
    expect(clampZoom({ zoom: Number.NaN, x: 0, y: 0 })).toEqual(NO_ZOOM);
  });
});
