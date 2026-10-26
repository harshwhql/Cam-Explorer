// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyReleaseSigning } = require('../withReleaseSigning');

const TEMPLATE = `
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

describe('withReleaseSigning', () => {
  const out: string = applyReleaseSigning(TEMPLATE);

  it('adds a release signing config fed from gradle properties', () => {
    expect(out).toMatch(/signingConfigs \{\s+release \{/);
    expect(out).toContain("storeFile file(project.property('CAMX_STORE_FILE'))");
    expect(out).not.toMatch(/storePassword '[^']+'\s+keyAlias 'camexplorer'/); // no secrets inlined
  });

  it('switches only the release build type', () => {
    expect(out).toContain('debug {\n            signingConfig signingConfigs.debug');
    expect(out).toContain(
      "signingConfig project.hasProperty('CAMX_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    expect(out.match(/hasProperty\('CAMX_STORE_FILE'\) \?/g)).toHaveLength(1);
  });

  it('is idempotent', () => {
    expect(applyReleaseSigning(out)).toBe(out);
  });
});
