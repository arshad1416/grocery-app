module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // Listed FIRST so it runs LAST. Babel runs presets in reverse order, so
      // babel-preset-expo (below) — including its TypeScript transform —
      // completes before this class-properties transform runs.
      //
      // Why this transform is needed at all: WatermelonDB's models use legacy
      // decorators, and Babel's legacy-decorator transform rewrites a decorated
      // class property into an `_applyDecoratedDescriptor` descriptor whose
      // initializer must then be materialised by a class-properties transform.
      // babel-preset-expo does not supply one, because Hermes supports class
      // fields natively and the preset leaves them untransformed. Without this,
      // Babel leaves `_initializerWarningHelper` in the initializer slot, which
      // throws
      //
      //   Decorating class property failed. Please ensure that
      //   transform-class-properties is enabled and runs after the decorators
      //   transform.
      //
      // the first time a model is constructed — so every WatermelonDB write
      // failed on device and the app persisted nothing. The suite stayed green
      // because __mocks__/watermelondb.ts stubs the decorators as no-ops.
      //
      // Why it is wrapped in a preset instead of listed in `plugins`: Babel
      // runs every plugin before any preset, so as a plugin it would also run
      // before babel-preset-expo's TypeScript transform, and dependencies that
      // use TS `declare` class fields (expo-file-system) then fail with
      // "TypeScript 'declare' fields must first be transformed by
      // @babel/plugin-transform-typescript". Babel `overrides` with an exclude
      // pattern is not usable either: Metro's Expo babel-transformer computes
      // its cache key by calling Babel with no filename, and any string/RegExp
      // pattern in the config throws "Configuration contains string/RegExp
      // pattern, but no filename was passed to Babel".
      // The three class-feature transforms must be enabled together and share
      // the same `loose` setting: turning on class-properties activates Babel's
      // class-features machinery, and dependencies that use class private
      // methods (react-native's Animated internals) then require their
      // transforms too.
      {
        plugins: [
          ['@babel/plugin-transform-class-properties', { loose: true }],
          ['@babel/plugin-transform-private-methods', { loose: true }],
          ['@babel/plugin-transform-private-property-in-object', { loose: true }],
        ],
      },
      'babel-preset-expo',
    ],
    plugins: [
      // WatermelonDB requires legacy decorators. Plugins run before presets, so
      // this necessarily precedes the class-properties transform above, which is
      // the order the decorator transform requires.
      ['@babel/plugin-proposal-decorators', { legacy: true }],
    ],
  };
};
