// Builds main, preload and renderer bundles with esbuild.
//   node scripts/build.mjs            one-off production build
//   node scripts/build.mjs --watch    rebuild on change
//   node scripts/build.mjs --launch   start Electron after the first build (use with --watch)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out');
const watch = process.argv.includes('--watch');
const launch = process.argv.includes('--launch');
const production = !watch;

const common = {
  bundle: true,
  sourcemap: production ? false : 'inline',
  minify: production,
  logLevel: 'info',
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development') },
};

const configs = [
  {
    ...common,
    entryPoints: { index: path.join(root, 'src/main/index.ts') },
    outdir: path.join(out, 'main'),
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['electron'],
    // Keep readable stack traces and the source-level __dirname behaviour in the main process.
    minify: false,
  },
  {
    ...common,
    entryPoints: { index: path.join(root, 'src/preload/index.ts'), overlay: path.join(root, 'src/preload/overlay.ts') },
    outdir: path.join(out, 'preload'),
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['electron'],
  },
  {
    ...common,
    entryPoints: { app: path.join(root, 'src/renderer/src/main.tsx'), overlay: path.join(root, 'src/renderer/src/overlay.ts') },
    outdir: path.join(out, 'renderer', 'assets'),
    platform: 'browser',
    target: 'chrome130',
    format: 'iife',
    jsx: 'automatic',
    loader: { '.svg': 'dataurl' },
  },
];

function copyStatic() {
  fs.mkdirSync(path.join(out, 'renderer'), { recursive: true });
  for (const file of ['index.html', 'overlay.html']) {
    fs.copyFileSync(path.join(root, 'src/renderer', file), path.join(out, 'renderer', file));
  }
}

fs.rmSync(out, { recursive: true, force: true });
copyStatic();

if (!watch) {
  await Promise.all(configs.map((c) => esbuild.build(c)));
  console.log('Build complete → out/');
} else {
  const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
  await Promise.all(contexts.map((c) => c.rebuild()));
  await Promise.all(contexts.map((c) => c.watch()));
  for (const file of ['index.html', 'overlay.html']) fs.watchFile(path.join(root, 'src/renderer', file), { interval: 500 }, copyStatic);
  console.log('Watching for changes. Reload the window with Ctrl+R; restart for main-process changes.');
  if (launch) {
    const require = createRequire(import.meta.url);
    const electron = require('electron');
    const child = spawn(electron, [root], { stdio: 'inherit' });
    child.on('exit', (code) => {
      void Promise.all(contexts.map((c) => c.dispose())).then(() => process.exit(code ?? 0));
    });
  }
}
