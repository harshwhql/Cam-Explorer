import { requireNativeView } from 'expo';
import * as React from 'react';

import type { RtspPlayerViewProps } from './RtspPlayer.types';

const NativeView: React.ComponentType<RtspPlayerViewProps> = requireNativeView('RtspPlayer');

export default function RtspPlayerView(props: RtspPlayerViewProps) {
  return <NativeView {...props} />;
}
