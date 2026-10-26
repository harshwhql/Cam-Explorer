# CamExplorer

A fast, private live viewer for CCTV cameras on **Android TVs, tablets and phones**.
Works with **CP Plus / Dahua** recorders and any **RTSP** or **ONVIF** camera on your local network.

## Features

- Live grid (1, 2×2, 3×3, 4×4) and full-screen view, with touch or a TV remote
- Layout adapts to the screen: full-screen grid on TVs, tablets and landscape phones,
  scrolling 16:9 tiles on portrait phones
- Self-healing streams: auto-reconnect, frozen-stream detection, network recovery
- Adapts to each device's hardware: tiles beyond its video-decoder limit refresh as snapshots,
  and the selected tile always plays live
- Finds recorders on the network (ONVIF) and auto-detects channels and camera names
- Private by design: LAN only, no cloud, no account, no analytics; passwords stored encrypted
  (Android Keystore) and never auto-retried, to avoid recorder account lockouts

## Build

Requires Node.js 22+ and Docker. The APK is built inside Docker, so no Android Studio or SDK is needed.

```bash
npm install
npm run check        # typecheck, lint, tests
npm run build:apk    # → dist/camexplorer-<version>-release.apk (TVs, tablets and phones)
```

The first build creates a local signing key in `.signing/`. Keep it safe: updates must be signed with the same key.

## Install

Copy the APK to the device and open it (allow installing unknown apps), or install over the network:

- **TV:** Developer options → USB debugging, then `npm run install:device -- <tv-ip>`
- **Phone / tablet:** Developer options → Wireless debugging (pair once with `adb pair`),
  then `npm run install:device -- <ip>:<port>`

## Testing without cameras

```bash
npm run fake-nvr     # fake CP Plus/Dahua recorder in Docker
```

Add a *CP Plus / Dahua* device with your computer's IP, RTSP port `8554`, HTTP port `8080`,
user `admin`, password `test1234`.

## Controls

| Where | Touch | TV remote | Action |
|---|---|---|---|
| Grid | Tap a tile | D-pad + OK | Open a camera full screen |
| Grid | ‹ › in the top bar | CH+ / CH− | Next / previous page |
| Full screen | ‹ › buttons | ◀ ▶ | Previous / next camera |
| Full screen | Sound button | OK | Sound on/off |
| Anywhere | Back | Back | Go back |

## License

[MIT](LICENSE)
