import type { ViewProps } from 'react-native';

export type PlayerState = 'idle' | 'connecting' | 'playing' | 'buffering' | 'paused' | 'error';

export interface PlayerStatusEvent {
  state: PlayerState;
  /** Present when state === 'error'. Matches StreamErrorCode in src/core/backoff.ts. */
  code?: string;
  /** Already redacted natively — never contains credentials. */
  message?: string;
}

export interface VideoSizeEvent {
  width: number;
  height: number;
}

export interface NativeSource {
  uri: string;
  username?: string;
  password?: string;
  transport: 'tcp' | 'udp';
  reloadKey: number;
}

export interface RtspPlayerViewProps extends ViewProps {
  source: NativeSource | null;
  muted: boolean;
  /**
   * Set up the audio track at all (fixed per connection — RTSP cannot add tracks mid-stream).
   * Default false: grid tiles never decode audio. `muted` then only toggles volume.
   */
  audioEnabled?: boolean;
  paused: boolean;
  resizeMode?: 'contain' | 'cover' | 'fill';
  /** 'texture' composes with overlays/animations; 'surface' is cheapest for full screen. */
  surfaceType?: 'texture' | 'surface';
  stallTimeoutMs?: number;
  connectTimeoutMs?: number;
  /** Digital zoom 1..4 (1 = off). */
  zoom?: number;
  /** Pan while zoomed, -1 (left/top) .. 1 (right/bottom). */
  panX?: number;
  panY?: number;
  onStatus?: (event: { nativeEvent: PlayerStatusEvent }) => void;
  onVideoSize?: (event: { nativeEvent: VideoSizeEvent }) => void;
}

export interface DecoderInfo {
  name: string;
  hardware: boolean;
  maxInstances: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface DecoderCapabilities {
  h264: DecoderInfo | null;
  h265: DecoderInfo | null;
  manufacturer?: string;
  model?: string;
  sdkInt?: number;
}

export interface OnvifProbeMatch {
  address: string;
  xaddrs: string[];
  scopes: string[];
}
