import { requireNativeView } from 'expo';
import * as React from 'react';

import type { RtspPlayerViewProps } from './RtspPlayer.types';
import RtspPlayerView from './RtspPlayerView';

export type PlayerEngine = 'standard' | 'compat';

let VlcNative: React.ComponentType<RtspPlayerViewProps> | null = null;
function vlcView(): React.ComponentType<RtspPlayerViewProps> {
  VlcNative ??= requireNativeView('RtspPlayerVlc');
  return VlcNative;
}

/**
 * Player with a selectable engine. "compat" (libVLC) is used only when this build includes it
 * (see isCompatEngineAvailable); zoom/pan/surfaceType apply to the standard engine.
 */
export function PlayerView({ engine = 'standard', compatAvailable, ...props }: RtspPlayerViewProps & { engine?: PlayerEngine; compatAvailable: boolean }) {
  if (engine === 'compat' && compatAvailable) {
    const Vlc = vlcView();
    const { zoom: _zoom, panX: _panX, panY: _panY, surfaceType: _surface, ...rest } = props;
    return <Vlc {...rest} />;
  }
  return <RtspPlayerView {...props} />;
}
