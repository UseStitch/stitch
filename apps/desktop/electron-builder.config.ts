import type { Configuration } from 'electron-builder';

const config: Configuration = {
  appId: 'com.stitch.desktop',
  productName: 'Stitch',
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
      filter: ['stitch-server*'],
    },
    {
      from: '../../packages/server/dist/node_modules',
      to: 'node_modules',
      filter: ['**/*'],
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
        'tools/providers/instructions/*.md',
        'llm/prompt/base-system-prompt.txt',
      ],
    },
  ],
  icon: 'resources/icon.png',
  nsis: {
    artifactName: '${productName}-v${version}-windows-setup.${ext}',
    include: 'installer/installer.nsh',
  },
  win: {
    icon: 'resources/icon.png',
    signAndEditExecutable: true,
    target: ['nsis'],
  },
  mac: {
    artifactName: '${productName}-v${version}-macos-${arch}.${ext}',
    icon: 'resources/icon.icns',
    category: 'public.app-category.developer-tools',
    binaries: ['Contents/Resources/stitch-server'],
    target: ['dmg', 'zip'],
  },
  linux: {
    icon: 'resources/icon.png',
    category: 'Development',
    target: ['AppImage', 'deb'],
  },
};

export default config;
