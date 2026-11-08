// Expo config plugin: route TV-remote number keys to the rtsp-player module.
// react-native-tvos doesn't forward digit keys to JS, so MainActivity hands them to
// expo.modules.rtspplayer.RemoteKeys (consumed only while the app listens).
const { withMainActivity } = require('expo/config-plugins');

const MARKER = 'expo.modules.rtspplayer.RemoteKeys';
const METHOD = `
  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
    if (expo.modules.rtspplayer.RemoteKeys.handle(this, event)) return true
    return super.dispatchKeyEvent(event)
  }
`;

function addRemoteKeys(source) {
  if (source.includes(MARKER)) return source;
  const classStart = source.search(/class\s+MainActivity\b/);
  const end = source.lastIndexOf('}');
  if (classStart === -1 || end < classStart) throw new Error('withRemoteKeys: MainActivity class not found');
  return source.slice(0, end) + METHOD + source.slice(end);
}

module.exports = function withRemoteKeys(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') throw new Error('withRemoteKeys: only Kotlin MainActivity is supported');
    cfg.modResults.contents = addRemoteKeys(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.addRemoteKeys = addRemoteKeys;
