#!/usr/bin/env bash
# Runs inside the camx-android-builder container.
#   /src   -> project checkout (read-only bind mount)
#   /build -> persistent working copy (named volume, keeps node_modules + gradle outputs warm)
#   /out   -> where APKs are written (bind mount to ./dist)
#   /keys  -> release keystore (bind mount to ./.signing, never committed)
#
# Usage: camx-build [release|debug] [abi-list]
set -euo pipefail

VARIANT="${1:-release}"
ABIS="${2:-armeabi-v7a,arm64-v8a,x86_64}"

echo ">> Syncing sources"
# Root-anchored excludes: an unanchored "android" would also drop modules/*/android (native code!).
rsync -a --delete \
  --exclude node_modules --exclude /android --exclude /ios --exclude /.git \
  --exclude /dist --exclude /.expo --exclude /.signing --exclude /coverage --exclude /.camx-native-hash \
  /src/ /build/

if [ ! -d /build/modules/rtsp-player/android/src ]; then
  echo "!! native module sources missing from /build" >&2
  exit 1
fi

cd /build

# Reinstall JS deps only when the lockfile changes.
if ! cmp -s package-lock.json node_modules/.camx-lock 2>/dev/null; then
  echo ">> Installing JS dependencies (npm ci)"
  npm ci --no-audit --no-fund
  cp package-lock.json node_modules/.camx-lock
fi

# Regenerate android/ from scratch only when native config changed; otherwise keep it so
# Gradle/CMake outputs are reused (C++ rebuilds dominate build time).
NATIVE_HASH="$(cat app.config.ts package-lock.json plugins/*.js modules/rtsp-player/expo-module.config.json \
  modules/rtsp-player/android/build.gradle 2>/dev/null | sha256sum | cut -d' ' -f1)-$(find assets -type f -exec sha256sum {} + | sort | sha256sum | cut -d' ' -f1)"
if [ -d android ] && [ "$(cat .camx-native-hash 2>/dev/null)" = "$NATIVE_HASH" ]; then
  echo ">> Native config unchanged — reusing android/ (incremental build)"
  # Restore gradle.properties to its generated state before re-appending build settings.
  [ -f android/gradle.properties.camx-orig ] && cp android/gradle.properties.camx-orig android/gradle.properties
else
  echo ">> Generating native Android project (TV + phone)"
  EXPO_TV=1 npx expo prebuild --platform android --clean --no-install
  cp android/gradle.properties android/gradle.properties.camx-orig
  echo "$NATIVE_HASH" > .camx-native-hash
fi

# Release signing: generate a dedicated local keystore once, reuse it forever
# (Android requires the same signature to install updates over an existing install).
if [ "$VARIANT" = "release" ]; then
  if [ ! -f /keys/release.jks ]; then
    echo ">> Creating local release keystore in .signing/ (keep it safe, never commit it)"
    PASS="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
    keytool -genkeypair -v -keystore /keys/release.jks -storetype PKCS12 \
      -alias camexplorer -keyalg RSA -keysize 4096 -validity 10000 \
      -storepass "$PASS" -keypass "$PASS" \
      -dname "CN=CamExplorer, O=CamExplorer" > /dev/null 2>&1
    printf 'CAMX_STORE_FILE=/keys/release.jks\nCAMX_STORE_PASSWORD=%s\nCAMX_KEY_ALIAS=camexplorer\nCAMX_KEY_PASSWORD=%s\n' \
      "$PASS" "$PASS" > /keys/signing.properties
    chmod 600 /keys/release.jks /keys/signing.properties
  fi
  cat /keys/signing.properties >> android/gradle.properties
fi

# Keep the build inside the Docker VM's memory budget: unbounded parallel C++ compiles
# (ninja defaults to cores+2) can exhaust an 8 GB VM and freeze it.
JOBS="$(nproc)"
cat >> android/gradle.properties <<EOF
org.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8
org.gradle.workers.max=${JOBS}
kotlin.compiler.execution.strategy=in-process
org.gradle.caching=true
EOF

cd android
TASK="assembleRelease"; [ "$VARIANT" = "debug" ] && TASK="assembleDebug"
echo ">> ./gradlew $TASK ($ABIS)"
./gradlew --no-daemon "$TASK" -PreactNativeArchitectures="$ABIS"

APK="app/build/outputs/apk/${VARIANT}/app-${VARIANT}.apk"
VERSION="$(node -p "require('/build/package.json').version")"
DEST="/out/camexplorer-${VERSION}-${VARIANT}.apk"
cp "$APK" "$DEST"
echo ">> Built $DEST ($(du -h "$DEST" | cut -f1))"
