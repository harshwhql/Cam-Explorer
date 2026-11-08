// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addRemoteKeys } = require('../withRemoteKeys');

const MAIN_ACTIVITY = `package com.camexplorer.app

import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun getMainComponentName(): String = "main"
}
`;

describe('withRemoteKeys', () => {
  const out: string = addRemoteKeys(MAIN_ACTIVITY);

  it('adds a dispatchKeyEvent override inside MainActivity', () => {
    expect(out).toContain('override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean');
    expect(out).toContain('expo.modules.rtspplayer.RemoteKeys.handle(this, event)');
    expect(out.trimEnd().endsWith('}')).toBe(true);
    expect(out.indexOf('dispatchKeyEvent')).toBeGreaterThan(out.indexOf('class MainActivity'));
  });

  it('is idempotent', () => {
    expect(addRemoteKeys(out)).toBe(out);
  });

  it('fails loudly if the template changes shape', () => {
    expect(() => addRemoteKeys('package x')).toThrow(/MainActivity/);
  });
});
