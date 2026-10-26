export type Transport = 'tcp' | 'udp';
export type StreamQuality = 'main' | 'sub';
export type GridLayout = 1 | 4 | 9 | 16;

export interface ChannelConfig {
  /** 1-based channel number as used by the recorder. */
  number: number;
  name: string;
  enabled: boolean;
}

interface DeviceBase {
  id: string;
  name: string;
  username: string;
  transport: Transport;
  createdAt: number;
}

/** CP Plus / Dahua NVR, DVR or standalone camera (Dahua RTSP + HTTP API). */
export interface DahuaDevice extends DeviceBase {
  kind: 'dahua';
  host: string;
  rtspPort: number;
  httpPort: number;
  channels: ChannelConfig[];
}

/** Any camera reachable by a plain RTSP URL. URLs are stored WITHOUT credentials. */
export interface RtspDevice extends DeviceBase {
  kind: 'rtsp';
  mainUrl: string;
  subUrl?: string;
}

export type Device = DahuaDevice | RtspDevice;
export type DeviceKind = Device['kind'];

/** A single viewable feed (one channel of a device). */
export interface Camera {
  id: string;
  deviceId: string;
  deviceName: string;
  name: string;
  channel: number;
}

/** What the native player needs to open a stream. Password is attached at the edge. */
export interface StreamSource {
  uri: string;
  username?: string;
  password?: string;
  transport: Transport;
}

export interface Settings {
  layout: GridLayout;
  page: number;
  gridQuality: StreamQuality;
  fullscreenQuality: StreamQuality;
  showLabels: boolean;
  tourEnabled: boolean;
  tourIntervalSec: number;
  stallTimeoutSec: number;
}

export const DEFAULT_SETTINGS: Settings = {
  layout: 4,
  page: 0,
  gridQuality: 'sub',
  fullscreenQuality: 'main',
  showLabels: true,
  tourEnabled: false,
  tourIntervalSec: 15,
  stallTimeoutSec: 8,
};
