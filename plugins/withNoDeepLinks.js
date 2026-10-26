// Expo config plugin: remove BROWSABLE (deep-link) intent filters from the main activity.
// CamExplorer has no reason to be opened by URLs, and a crafted camexplorer:// link could
// otherwise pre-fill the "add device" form with an attacker's host (password phishing).
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

function stripBrowsableIntentFilters(manifest) {
  const activity = AndroidConfig.Manifest.getMainActivity(manifest);
  if (!activity || !activity['intent-filter']) return manifest;
  activity['intent-filter'] = activity['intent-filter'].filter((filter) => {
    const categories = (filter.category ?? []).map((c) => c.$['android:name']);
    return !categories.includes('android.intent.category.BROWSABLE');
  });
  return manifest;
}

module.exports = function withNoDeepLinks(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = stripBrowsableIntentFilters(cfg.modResults);
    return cfg;
  });
};

module.exports.stripBrowsableIntentFilters = stripBrowsableIntentFilters;
