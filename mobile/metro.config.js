const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// The app imports the shared engine/, constants.tsx and types.ts from the web app at the repo root.
config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
// Never let Metro crawl or resolve from the web app's own dependencies or build output.
const escape = (p) => p.replace(/[/\\]/g, '[/\\\\]').replace(/\./g, '\\.');
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${escape(path.join(repoRoot, 'node_modules'))}[/\\\\].*`),
  new RegExp(`^${escape(path.join(repoRoot, 'dist'))}[/\\\\].*`),
];

module.exports = config;
