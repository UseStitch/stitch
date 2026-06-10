import { existsSync } from 'node:fs';

import type { Configuration } from 'electron-builder';

const audioCaptureBinaryFilter =
  process.platform === 'win32'
    ? ['stitch-audio-capture.exe', 'stitch-meeting-watch.exe']
    : ['stitch-audio-capture', 'stitch-meeting-watch'];

const audioCaptureResource = {
  from: '../../native/target/release',
  to: 'audio-capture',
  filter: audioCaptureBinaryFilter,
};

const hasAudioCaptureResource = existsSync(audioCaptureResource.from);

const shouldNotarize = Boolean(
  process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER,
);

const config: Configuration = {
  appId: 'com.stitch.desktop',
  productName: 'Stitch',
  electronLanguages: ['en-US'],
  publish: [
    {
      provider: 'github',
      owner: 'UseStitch',
      repo: 'stitch',
    },
  ],
  directories: {
    output: 'dist',
    buildResources: 'resources',
  },
  files: ['out/**/*'],
  extraResources: [
    {
      from: 'resources/',
      to: '',
      filter: ['icon.png', 'icon.ico'],
    },
    {
      from: '../../packages/server/dist',
      to: '',
      filter: ['stitch-server*', 'stitch-sandbox*'],
    },
    {
      from: '../../packages/server/drizzle',
      to: 'drizzle',
      filter: ['**/*'],
    },
    {
      from: '../web/dist',
      to: 'web/dist',
      filter: ['**/*'],
    },
    {
      from: '../../packages/server/src',
      to: 'server-assets',
      filter: [
        'meeting/*.md',
        'skills/built-ins/**/*.md',
        'lib/browser/instructions/*.md',
        'llm/prompt/base-system-prompt.txt',
      ],
    },
    ...(hasAudioCaptureResource ? [audioCaptureResource] : []),
  ],
  icon: 'resources/icon.png',
  nsis: {
    artifactName: '${productName}-windows-setup.${ext}',
    include: 'installer/installer.nsh',
  },
  win: {
    icon: 'resources/icon.png',
    signAndEditExecutable: true,
    target: ['nsis'],
  },
  mac: {
    artifactName: '${productName}-macos-${arch}.${ext}',
    icon: 'resources/icon.icns',
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    notarize: shouldNotarize,
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.inherit.plist',
    binaries: [
      'Contents/Resources/stitch-server',
      'Contents/Resources/stitch-sandbox',
      'Contents/Resources/audio-capture/stitch-audio-capture',
      'Contents/Resources/audio-capture/stitch-meeting-watch',
    ],
    target: ['dmg', 'zip'],
  },
  linux: {
    icon: 'resources/icon.png',
    category: 'Development',
    target: ['AppImage', 'deb'],
  },
};

export default config;
