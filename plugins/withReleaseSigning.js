// Expo config plugin: sign release builds with a local keystore when the
// CAMX_* gradle properties are present (injected by docker/android-builder/build.sh).
// Falls back to the debug key otherwise so local release builds still work.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_SIGNING = `
        release {
            if (project.hasProperty('CAMX_STORE_FILE')) {
                storeFile file(project.property('CAMX_STORE_FILE'))
                storePassword project.property('CAMX_STORE_PASSWORD')
                keyAlias project.property('CAMX_KEY_ALIAS')
                keyPassword project.property('CAMX_KEY_PASSWORD')
            }
        }`;

function applyReleaseSigning(gradle) {
  if (gradle.includes("CAMX_STORE_FILE")) return gradle;

  const signingOpen = gradle.indexOf('signingConfigs {');
  if (signingOpen === -1) throw new Error('withReleaseSigning: signingConfigs block not found');
  const insertAt = signingOpen + 'signingConfigs {'.length;
  let out = gradle.slice(0, insertAt) + RELEASE_SIGNING + gradle.slice(insertAt);

  // Point the release buildType at the release signing config.
  const buildTypes = out.indexOf('buildTypes {');
  const releaseIdx = out.indexOf('release {', buildTypes);
  if (buildTypes === -1 || releaseIdx === -1) {
    throw new Error('withReleaseSigning: buildTypes.release not found');
  }
  const head = out.slice(0, releaseIdx);
  const tail = out
    .slice(releaseIdx)
    .replace(
      'signingConfig signingConfigs.debug',
      "signingConfig project.hasProperty('CAMX_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
  out = head + tail;
  return out;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: only Groovy build.gradle is supported');
    }
    cfg.modResults.contents = applyReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.applyReleaseSigning = applyReleaseSigning;
