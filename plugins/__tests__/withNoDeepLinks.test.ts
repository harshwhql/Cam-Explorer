// eslint-disable-next-line @typescript-eslint/no-require-imports
const { stripBrowsableIntentFilters } = require('../withNoDeepLinks');

const manifest = () => ({
  manifest: {
    application: [
      {
        $: { 'android:name': '.MainApplication' },
        activity: [
          {
            $: { 'android:name': '.MainActivity' },
            'intent-filter': [
              {
                action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
                category: [
                  { $: { 'android:name': 'android.intent.category.LAUNCHER' } },
                  { $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } },
                ],
              },
              {
                action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
                category: [
                  { $: { 'android:name': 'android.intent.category.DEFAULT' } },
                  { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
                ],
                data: [{ $: { 'android:scheme': 'camexplorer' } }],
              },
            ],
          },
        ],
      },
    ],
  },
});

describe('withNoDeepLinks', () => {
  it('removes deep-link filters but keeps the phone + TV launchers', () => {
    const out = stripBrowsableIntentFilters(manifest());
    const filters = out.manifest.application[0].activity[0]['intent-filter'];
    expect(filters).toHaveLength(1);
    expect(JSON.stringify(filters)).toContain('LEANBACK_LAUNCHER');
    expect(JSON.stringify(filters)).not.toContain('BROWSABLE');
  });
});
