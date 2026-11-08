// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addPipToActivitySource, addPipToManifest } = require('../withPictureInPicture');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addRemoteKeys } = require('../withRemoteKeys');

const MAIN_ACTIVITY = `package com.camexplorer.app

import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun getMainComponentName(): String = "main"
}
`;

const manifest = () => ({
  manifest: {
    application: [
      {
        $: { 'android:name': '.MainApplication' },
        activity: [
          {
            $: { 'android:name': '.MainActivity', 'android:configChanges': 'keyboard|orientation|screenSize|uiMode' },
            'intent-filter': [
              {
                action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
                category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
              },
            ],
          },
        ],
      },
    ],
  },
});

describe('withPictureInPicture', () => {
  it('declares PiP support and the needed config changes without duplicates', () => {
    const m = addPipToManifest(manifest());
    const a = m.manifest.application[0].activity[0].$;
    expect(a['android:supportsPictureInPicture']).toBe('true');
    const changes = a['android:configChanges'].split('|');
    for (const c of ['screenSize', 'smallestScreenSize', 'screenLayout', 'orientation', 'uiMode']) expect(changes).toContain(c);
    expect(new Set(changes).size).toBe(changes.length);
  });

  it('forwards activity callbacks, composes with the remote-keys plugin, and is idempotent', () => {
    const both = addPipToActivitySource(addRemoteKeys(MAIN_ACTIVITY));
    expect(both).toContain('Pip.onUserLeaveHint(this)');
    expect(both).toContain('Pip.onModeChanged(isInPictureInPictureMode)');
    expect(both).toContain('RemoteKeys.handle(this, event)');
    expect(addPipToActivitySource(both)).toBe(both);
    expect(both.trimEnd().endsWith('}')).toBe(true);
  });
});
