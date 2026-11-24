const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The SDK's event emitter package bundles Node's util.inspect, which crashes
// Hermes at load time; the app uses a small compatible copy instead.
const SHIMS = {
  "@vladfrangu/async_event_emitter": path.join(__dirname, "src/shims/async-event-emitter.ts"),
  // One SolidJS for everyone. Left alone, the SDK's `import` got the ES build
  // and the app's compiled `require` the CommonJS build: two copies, so the
  // screens never heard the SDK's changes (empty server list).
  "solid-js": path.join(__dirname, "node_modules/solid-js/dist/solid.js"),
  "solid-js/store": path.join(__dirname, "node_modules/solid-js/store/dist/store.js"),
};
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SHIMS[moduleName]) return { type: "sourceFile", filePath: SHIMS[moduleName] };
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

// NativeWind was removed on 2026-11-23: its wrapper around Pressable dropped
// function styles on phones (rows laid out in a column). Styles are plain RN.
module.exports = config;
