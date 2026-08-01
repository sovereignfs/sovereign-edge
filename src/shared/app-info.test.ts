import { APP_VERSION } from './app-info';

/**
 * The app's version lives in three hand-maintained places, and nothing at
 * build time reconciles them. This locks them together.
 *
 * It is not a tidiness check. The native version string is what the OS,
 * TestFlight, and the Play Console use to order builds, and it is the only
 * version visible from outside the app — so a mismatch ships a binary that
 * misreports itself. It also cost real debugging time once: with the native
 * version stale, there was no way to tell an old install from a new one on a
 * test device, and the only usable evidence turned out to be `APP_VERSION`
 * rendered on the Settings screen, since that one is compiled into the JS
 * bundle.
 *
 * A fourth copy exists in `ios/Info.plist` and `android/app/build.gradle`, but
 * those are generated from `app.json` by `expo prebuild` and are gitignored,
 * so they cannot be asserted on here — a bump means regenerating them. See
 * AGENTS.md.
 */
describe('app version', () => {
  it('agrees across package.json, app.json, and app-info', () => {
    const pkg = require('../../package.json') as { version: string };
    const appJson = require('../../app.json') as {
      expo: { version: string };
    };

    expect(APP_VERSION).toBe(pkg.version);
    expect(appJson.expo.version).toBe(pkg.version);
  });
});
