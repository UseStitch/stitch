import { existsSync } from 'node:fs';

import type { Configuration } from 'electron-builder';

const audioCaptureResource = {
  from: '../../packages/audio-capture/native',
  to: 'audio-capture',
  filter: ['*.node', 'binding.cjs'],
};

const hasAudioCaptureResource = existsSync(audioCaptureResource.from);

const audioCaptureDarwinBinary = `Contents/Resources/audio-capture/index.darwin-${process.arch}.node`;

const meetingDetectionResource = {
  from: '../../packages/meeting-detection/native',
  to: 'meeting-detection',
  filter: ['*.node', 'binding.cjs'],
};

const hasMeetingDetectionResource = existsSync(meetingDetectionResource.from);

const meetingDetectionDarwinBinary = `Contents/Resources/meeting-detection/index.darwin-${process.arch}.node`;

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
  files: [
    'out/**/*',
    // Addon ships via extraResources; keep its Rust build tree out of the asar.
    '!node_modules/@stitch/meeting-detection/{target,src-rs,native,.turbo}/**',
    '!node_modules/@stitch/meeting-detection/{Cargo.toml,Cargo.lock,build.rs,rustfmt.toml}',
    '!node_modules/@stitch/audio-capture/{target,src-rs,native,crates,.turbo}/**',
    '!node_modules/@stitch/audio-capture/{Cargo.toml,Cargo.lock,build.rs,rustfmt.toml}',
  ],
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
    ...(hasMeetingDetectionResource ? [meetingDetectionResource] : []),
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
    extendInfo: {
      NSMicrophoneUsageDescription:
        'Stitch needs microphone access to record audio during meetings and voice notes.',
      NSAudioCaptureUsageDescription:
        'Stitch needs system audio access to capture meeting audio from other applications.',
      NSAppleEventsUsageDescription:
        'Stitch reads browser window titles to detect when you join a meeting.',
    },
    binaries: [
      'Contents/Resources/stitch-server',
      'Contents/Resources/stitch-sandbox',
      audioCaptureDarwinBinary,
      meetingDetectionDarwinBinary,
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
