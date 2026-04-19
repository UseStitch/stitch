import { build, context } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, 'dist');
const watch = process.argv.includes('--watch');

const esbuildConfig = {
  entryPoints: [join(__dirname, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(outDir, 'stitch-server.mjs'),
  minify: !watch,
  // Native modules and packages with native addons must be external
  external: [
    'better-sqlite3',
    '@lancedb/lancedb',
    'apache-arrow',
    'quickjs-emscripten',
    // esbuild itself is external so it can be loaded at runtime for TS stripping
    'esbuild',
  ],
  // Ensure dynamic imports resolve correctly at runtime
  banner: {
    js: `
import { createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname2 } from 'node:path';
const require = createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirnameCompat = __dirname2(__filename);
`.trim(),
  },
};

await mkdir(outDir, { recursive: true });

// Copy drizzle migrations alongside the bundle
const drizzleSource = join(__dirname, 'drizzle');
const drizzleDest = join(outDir, 'drizzle');
try {
  await cp(drizzleSource, drizzleDest, { recursive: true });
} catch {
  // No drizzle directory yet — skip
}

// Copy static server assets so STITCH_SERVER_DIR resolution works in dev
const serverAssetsToCopy = [
  {
    src: join(__dirname, 'src/meeting'),
    dest: join(outDir, 'server-assets/meeting'),
    filter: /\.md$/,
  },
  {
    src: join(__dirname, 'src/lib/browser/instructions'),
    dest: join(outDir, 'server-assets/lib/browser/instructions'),
    filter: /\.md$/,
  },
  {
    src: join(__dirname, 'src/llm/prompt'),
    dest: join(outDir, 'server-assets/llm/prompt'),
    filter: /base-system-prompt\.txt$/,
  },
];

await Promise.all(
  serverAssetsToCopy.map(async ({ src, dest, filter }) => {
    try {
      await cp(src, dest, {
        recursive: true,
        filter: (s) => filter.test(s) || !s.includes('.'),
      });
    } catch {
      // source directory may not exist yet — skip
    }
  }),
);

if (watch) {
  const ctx = await context(esbuildConfig);
  await ctx.watch();
  console.log('[server] watching for changes...');
} else {
  await build(esbuildConfig);
  console.log('Build complete: dist/stitch-server.mjs');
}
