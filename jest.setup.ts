/* eslint-disable @typescript-eslint/no-require-imports */
// In-memory stand-ins for native modules so logic + UI can be tested on Node.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    setItemAsync: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    deleteItemAsync: jest.fn(async (k: string) => {
      store.delete(k);
    }),
  };
});

jest.mock('rtsp-player', () => {
  const React = require('react');
  const { View } = require('react-native');
  const RtspPlayerView = jest.fn((props: Record<string, unknown>) =>
    React.createElement(View, { testID: 'rtsp-player', ...props }),
  );
  return {
    RtspPlayerView,
    getDecoderCapabilities: () => ({
      h264: { name: 'mock.avc', hardware: true, maxInstances: 16, maxWidth: 3840, maxHeight: 2160 },
      h265: { name: 'mock.hevc', hardware: true, maxInstances: 8, maxWidth: 3840, maxHeight: 2160 },
      manufacturer: 'Generic',
      model: 'Android TV',
    }),
    discoverOnvif: jest.fn(async () => []),
    isNativePlayerAvailable: true,
  };
});

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ name }: { name: string }) => React.createElement(Text, null, `icon:${name}`);
});

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn(async () => undefined),
  isLoaded: () => true,
}));
