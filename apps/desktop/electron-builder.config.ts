import type { Configuration } from 'electron-builder';

const config: Configuration = {
  appId: 'com.stitch.desktop',
  productName: 'Stitch',
  directories: {
    output: 'dist',
    buildResources: 'resources',
  },
  files: ['out/**/*'],
  extraResources: [
    {
      from: 'resources/',
      to: '',
      filter: ['stitch-server*'],
    },
  ],
  icon: 'resources/icon.png',
  nsis: {
    include: 'installer/installer.nsh',
  },
  win: {
    icon: 'resources/icon.ico',
    target: ['nsis'],
  },
  mac: {
    icon: 'resources/icon.icns',
    category: 'public.app-category.developer-tools',
    target: ['dmg', 'zip'],
  },
  linux: {
    icon: 'resources/icon.png',
    category: 'Development',
    target: ['AppImage', 'deb'],
  },
};

export default config;
