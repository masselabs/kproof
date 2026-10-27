const {execSync} = require('child_process');
const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * The app uses the repository's own SDK (`@kproof/sdk`, installed as
 * `file:../sdk`, so node_modules holds a symlink). Metro has to watch the SDK
 * folder, and resolve the SDK's dependencies from the workspace's hoisted
 * node_modules, where npm put them.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const repo = execSync('git rev-parse --show-toplevel', {cwd: __dirname, encoding: 'utf8'}).trim();

const config = {
  watchFolders: [path.join(repo, 'sdk'), path.join(repo, 'node_modules')],
  resolver: {
    nodeModulesPaths: [path.join(__dirname, 'node_modules'), path.join(repo, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
