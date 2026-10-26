import { useMemo } from 'react';

import { getDecoderCapabilities } from 'rtsp-player';

/**
 * How many video streams the device can decode in hardware at once. CCTV recorders may send
 * H.264 or H.265, so take the smaller of the two hardware limits. Unknown (web/tests) → 16.
 * Example: many TV and budget phone chipsets report 2 → the grid shows 2 live tiles + snapshots.
 */
export function useDecoderBudget(): number {
  return useMemo(() => {
    const caps = getDecoderCapabilities();
    const limits = [caps?.h264, caps?.h265]
      .filter((d) => d && d.hardware && d.maxInstances > 0)
      .map((d) => d!.maxInstances);
    return limits.length ? Math.min(...limits) : 16;
  }, []);
}
