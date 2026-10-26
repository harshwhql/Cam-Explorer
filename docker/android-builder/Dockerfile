# Reproducible Android build environment for CamExplorer.
# Lets us build the APK without installing Android Studio / SDK / JDK on the host.
FROM eclipse-temurin:17-jdk-jammy

ARG NODE_VERSION=24.22.0
ARG CMDLINE_TOOLS=16111833
ARG COMPILE_SDK=37
ARG TARGET_SDK=36
ARG BUILD_TOOLS=37.0.0
ARG NDK_VERSION=27.1.12297006
ARG CMAKE_VERSION=3.22.1

ENV ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    GRADLE_USER_HOME=/cache/gradle \
    npm_config_cache=/cache/npm \
    CI=1 \
    EXPO_NO_TELEMETRY=1 \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl unzip git rsync xz-utils ca-certificates python3 \
 && rm -rf /var/lib/apt/lists/*

# Node.js LTS (official tarball, checksum verified)
RUN set -eux; \
    cd /tmp; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"; \
    grep " node-v${NODE_VERSION}-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c -; \
    tar -xJf "node-v${NODE_VERSION}-linux-x64.tar.xz" -C /usr/local --strip-components=1; \
    rm -f node-v*.tar.xz SHASUMS256.txt; \
    node -v; npm -v

# Android SDK command-line tools + required packages
RUN set -eux; \
    mkdir -p "$ANDROID_HOME/cmdline-tools"; \
    cd /tmp; \
    curl -fsSLo tools.zip "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip"; \
    unzip -q tools.zip -d "$ANDROID_HOME/cmdline-tools"; \
    mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"; \
    rm tools.zip; \
    yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null; \
    "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --install \
      "platform-tools" \
      "platforms;android-${COMPILE_SDK}" \
      "platforms;android-${TARGET_SDK}" \
      "build-tools;${BUILD_TOOLS}" \
      "ndk;${NDK_VERSION}" \
      "cmake;${CMAKE_VERSION}" > /dev/null

# Extra packages AGP requests at build time (separate layer so the big one above stays cached).
RUN yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --install "platforms;android-37.0" "build-tools;36.0.0" > /dev/null

ENV PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

COPY build.sh /usr/local/bin/camx-build
RUN sed -i 's/\r$//' /usr/local/bin/camx-build && chmod +x /usr/local/bin/camx-build

WORKDIR /build
ENTRYPOINT ["camx-build"]
