// The app shares Lera's logic (maths engine, book reader, learner model) with the web build: it lives in ../../src
// and is imported as "@core/…". Metro has to be told to watch that folder and to find packages only here.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../../src')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
module.exports = config;
