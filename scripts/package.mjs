// Packages the built app into a portable, unpacked Electron distribution plus a .zip.
//
//   node scripts/package.mjs                       package for the current OS
//   node scripts/package.mjs --platform win32      cross-package for Windows (x64)
//   node scripts/package.mjs --electron-zip <zip>  use a pre-downloaded Electron release zip
//
// For a platform other than the host, the matching Electron release is downloaded from
// github.com/electron/electron and verified against the release's SHASUMS256.txt.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const electronVersion = require('electron/package.json').version;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const platform = arg('platform', process.platform);
const arch = arg('arch', 'x64');
if (!['win32', 'linux'].includes(platform)) {
  console.error(`Packaging for "${platform}" is not supported by this script yet (supported: win32, linux).`);
  process.exit(1);
}
if (!fs.existsSync(path.join(root, 'out', 'main', 'index.js'))) {
  console.error('No build found. Run "npm run build" first.');
  process.exit(1);
}

const product = pkg.productName;
const releaseDir = path.join(root, 'release');
const appDir = path.join(releaseDir, `${product}-${platform}-${arch}`);
const zipName = `electron-v${electronVersion}-${platform}-${arch}.zip`;

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function electronZip() {
  const given = arg('electron-zip', '');
  if (given) return path.resolve(given);
  const cache = path.join(root, '.cache', 'electron');
  const file = path.join(cache, zipName);
  const base = `https://github.com/electron/electron/releases/download/v${electronVersion}`;
  fs.mkdirSync(cache, { recursive: true });
  if (!fs.existsSync(file)) {
    console.log(`Downloading ${zipName} …`);
    fs.writeFileSync(file, await download(`${base}/${zipName}`));
  }
  const sums = (await download(`${base}/SHASUMS256.txt`)).toString('utf8');
  const expected = sums.split('\n').find((l) => l.trim().endsWith(zipName))?.split(/\s+/)[0];
  const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (!expected || expected !== actual) {
    fs.rmSync(file, { force: true });
    throw new Error(`Checksum mismatch for ${zipName}; the download was discarded.`);
  }
  console.log('Checksum verified.');
  return file;
}

function extract(zip, dest) {
  fs.mkdirSync(dest, { recursive: true });
  // bsdtar (Windows 10+, macOS) reads zip archives; GNU tar on Linux does not.
  if (process.platform === 'linux') execFileSync('unzip', ['-q', '-o', zip, '-d', dest], { stdio: 'inherit' });
  else execFileSync('tar', ['-xf', zip, '-C', dest], { stdio: 'inherit' });
}

function archive(dir, zip) {
  fs.rmSync(zip, { force: true });
  const cwd = path.dirname(dir);
  const name = path.basename(dir);
  if (process.platform === 'win32') execFileSync('tar', ['-a', '-cf', zip, name], { cwd, stdio: 'inherit' });
  else execFileSync('zip', ['-q', '-r', '-y', zip, name], { cwd, stdio: 'inherit' });
}

fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });

const useLocal = platform === process.platform && arch === process.arch && !arg('electron-zip', '');
if (useLocal) {
  const dist = path.dirname(require('electron'));
  fs.cpSync(dist, appDir, { recursive: true, verbatimSymlinks: true });
} else {
  extract(await electronZip(), appDir);
}

// Rename the executable and drop Electron's demo app.
const exeFrom = path.join(appDir, platform === 'win32' ? 'electron.exe' : 'electron');
const exeTo = path.join(appDir, platform === 'win32' ? `${product}.exe` : product.toLowerCase());
fs.renameSync(exeFrom, exeTo);
fs.rmSync(path.join(appDir, 'resources', 'default_app.asar'), { force: true });

// The app itself: bundled output only. All dependencies are compiled into out/, so no node_modules are shipped.
const target = path.join(appDir, 'resources', 'app');
fs.mkdirSync(target, { recursive: true });
fs.cpSync(path.join(root, 'out'), path.join(target, 'out'), { recursive: true });
fs.mkdirSync(path.join(target, 'resources'), { recursive: true });
for (const f of ['icon.png', 'tray.png', 'icon.ico']) fs.copyFileSync(path.join(root, 'resources', f), path.join(target, 'resources', f));
fs.writeFileSync(
  path.join(target, 'package.json'),
  `${JSON.stringify({ name: pkg.name, productName: product, version: pkg.version, description: pkg.description, license: pkg.license, main: pkg.main }, null, 2)}\n`,
);
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(appDir, `LICENSE.${product}.txt`));

const zip = path.join(releaseDir, `${product}-${pkg.version}-${platform}-${arch}.zip`);
archive(appDir, zip);
const mb = (fs.statSync(zip).size / 1024 / 1024).toFixed(1);
console.log(`Packaged ${product} ${pkg.version} (Electron ${electronVersion}) for ${platform}-${arch}`);
console.log(`  folder: ${path.relative(root, appDir)}`);
console.log(`  zip:    ${path.relative(root, zip)} (${mb} MB)`);
