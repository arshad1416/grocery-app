const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

/**
 * Sets android:usesCleartextTraffic="true" on the <application> element.
 *
 * Why a plugin and not an app.json key: Expo SDK 56 has NO
 * `android.usesCleartextTraffic` in its config schema, and no config-plugin mod
 * reads one. A bare key in app.json is silently ignored — verified by running
 * `expo prebuild --clean` against an app.json that carried it and finding no
 * such attribute in the generated manifest. That inert key is what made an
 * earlier audit conclude "app.json is already correct; only the native manifest
 * drifted", when in fact neither source produced the attribute.
 *
 * The app needs it because the relay is self-hosted: the default relay URL is
 * `ws://localhost` (src/config/settings.ts) and families point it at a LAN
 * address. A box on a private network cannot practically obtain a TLS cert, so
 * wss:// is not a substitute — it would remove the primary use case. Android 9+
 * blocks cleartext by default, so without this a release build cannot reach any
 * plaintext relay at all.
 */
function withCleartextTraffic(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$["android:usesCleartextTraffic"] = "true";
    return cfg;
  });
}

module.exports = withCleartextTraffic;
