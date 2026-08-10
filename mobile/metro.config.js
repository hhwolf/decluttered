// Metro is pointed at ../src so the mobile client imports the SAME engine,
// domain definitions and catalogue JSON the web client uses — no copy, no
// second source of truth. Only ../src is watched (not the repo root), which
// keeps dist/ and the web node_modules out of the file-watcher.
//
// `mjs` has to be added to sourceExts: the engine modules are .mjs so Node can
// run the test suites directly without a build step, and Metro does not resolve
// that extension by default.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");
const sharedRoot = path.resolve(repoRoot, "src");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(repoRoot, "node_modules"),
];
if (!config.resolver.sourceExts.includes("mjs")) {
  config.resolver.sourceExts.push("mjs");
}

module.exports = config;
