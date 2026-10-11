const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// munim-bluetooth is native-only; swap in a no-op stub so the web preview can bundle.
const bluetoothWebStub = path.resolve(__dirname, 'src/web-stubs/munim-bluetooth.ts');
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (platform === 'web') {
    if (moduleName === 'munim-bluetooth') {
      return { type: 'sourceFile', filePath: bluetoothWebStub };
    }
    // zustand's ESM build uses import.meta, which breaks the non-module web bundle; use its CJS build.
    if (moduleName === 'zustand' || moduleName.startsWith('zustand/')) {
      return { type: 'sourceFile', filePath: require.resolve(moduleName) };
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
