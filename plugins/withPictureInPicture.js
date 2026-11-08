// Expo config plugin: picture-in-picture for the full-screen camera.
//  - manifest: MainActivity supports PiP and handles the size changes itself
//  - MainActivity: forwards onUserLeaveHint / onPictureInPictureModeChanged to the
//    rtsp-player module (expo.modules.rtspplayer.Pip)
const { AndroidConfig, withAndroidManifest, withMainActivity } = require('expo/config-plugins');

const MARKER = 'expo.modules.rtspplayer.Pip';
const METHODS = `
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    expo.modules.rtspplayer.Pip.onUserLeaveHint(this)
  }

  override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: android.content.res.Configuration) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    expo.modules.rtspplayer.Pip.onModeChanged(isInPictureInPictureMode)
  }
`;
const NEEDED_CONFIG_CHANGES = ['screenSize', 'smallestScreenSize', 'screenLayout', 'orientation'];

function addPipToActivitySource(source) {
  if (source.includes(MARKER)) return source;
  const classStart = source.search(/class\s+MainActivity\b/);
  const end = source.lastIndexOf('}');
  if (classStart === -1 || end < classStart) throw new Error('withPictureInPicture: MainActivity class not found');
  return source.slice(0, end) + METHODS + source.slice(end);
}

function addPipToManifest(manifest) {
  const activity = AndroidConfig.Manifest.getMainActivity(manifest);
  if (!activity) throw new Error('withPictureInPicture: main activity not found');
  activity.$['android:supportsPictureInPicture'] = 'true';
  activity.$['android:resizeableActivity'] = 'true';
  const current = (activity.$['android:configChanges'] ?? '').split('|').filter(Boolean);
  for (const c of NEEDED_CONFIG_CHANGES) if (!current.includes(c)) current.push(c);
  activity.$['android:configChanges'] = current.join('|');
  return manifest;
}

module.exports = function withPictureInPicture(config) {
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = addPipToManifest(cfg.modResults);
    return cfg;
  });
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') throw new Error('withPictureInPicture: only Kotlin MainActivity is supported');
    cfg.modResults.contents = addPipToActivitySource(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.addPipToActivitySource = addPipToActivitySource;
module.exports.addPipToManifest = addPipToManifest;
