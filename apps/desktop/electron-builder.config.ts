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
  win: {
    target: ['nsis'],
  },
  mac: {
    category: 'public.app-category.developer-tools',
    target: ['dmg', 'zip'],
  },
  linux: {
    category: 'Development',
    target: ['AppImage', 'deb'],
  },
};

export default config;
