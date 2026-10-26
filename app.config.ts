import type { ExpoConfig } from 'expo/config';

const BG = '#0A0D12';

const config: ExpoConfig = {
  name: 'CamExplorer',
  slug: 'camexplorer',
  scheme: 'camexplorer',
  version: '0.1.0',
  orientation: 'default',
  userInterfaceStyle: 'dark',
  backgroundColor: BG,
  icon: './assets/icon.png',
  android: {
    package: 'com.camexplorer.app',
    versionCode: 1,
    // Never ship config/credentials to Google cloud backup.
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-foreground.png',
      backgroundColor: BG,
    },
    // Least privilege: only what live viewing + LAN discovery needs.
    permissions: [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.ACCESS_WIFI_STATE',
      'android.permission.CHANGE_WIFI_MULTICAST_STATE',
    ],
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'android.permission.VIBRATE',
      // expo-secure-store adds these for optional biometric unlock, which we don't use.
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
    ],
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'single',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-splash-screen',
      {
        backgroundColor: BG,
        image: './assets/splash.png',
        imageWidth: 160,
      },
    ],
    [
      '@react-native-tvos/config-tv',
      {
        // One APK for Android TVs, tablets and phones: adds the TV launcher entry + banner,
        // marks touchscreen as optional, keeps the normal phone launcher.
        isTV: true,
        androidTVBanner: './assets/tv-banner.png',
        androidTVIcon: './assets/tv-icon.png',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          // NVR HTTP APIs on the LAN are plain HTTP (we only ever use Digest auth there).
          usesCleartextTraffic: true,
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          networkInspector: false,
        },
      },
    ],
    [
      'expo-font',
      {
        // Embed the icon font in the APK so icons render instantly (no async load).
        fonts: ['./node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'],
      },
    ],
    './plugins/withReleaseSigning',
    './plugins/withNoDeepLinks',
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
