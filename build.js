// Builds the Windows app into dist/App (the folder that goes in E:\Pictures\Batch Image Merger\App),
// stamps the .exe and zips it as dist/Batch-Image-Merger-v<version>.zip (unpacks to App\).
const { packager } = require('@electron/packager');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const pkg = require('./package.json');
(async () => {
  const dist = path.join(__dirname, 'dist');
  fs.rmSync(dist, { recursive: true, force: true }); fs.mkdirSync(dist);
  const [out] = await packager({
    dir: __dirname, name: 'Batch Image Merger', platform: 'win32', arch: 'x64', out: dist, overwrite: true, asar: false,
    appVersion: pkg.version, win32metadata: { CompanyName: 'Personal', ProductName: 'Batch Image Merger' },
    ignore: [/^\/tests/, /^\/dist/, /^\/dev-root/, /^\/build\.js/, /^\/build-win\.sh/, /^\/\.github/, /^\/docs/, /^\/[A-Z]+\.md$/, /^\/READ ME FIRST\.txt/, /^\/samples/,
      /\/node_modules\/@img\/sharp-(linux|linuxmusl|wasm32|darwin)/, /\/node_modules\/@img\/sharp-libvips-(linux|linuxmusl|darwin)/, /\/node_modules\/(resedit|pe-library|playwright[^/]*)\//],
  });
  const app = path.join(dist, 'App');
  fs.renameSync(out, app);
  fs.copyFileSync(path.join(__dirname, 'READ ME FIRST.txt'), path.join(dist, 'READ ME FIRST.txt'));
  // sharp only needs its Windows parts
  const img = path.join(app, 'resources', 'app', 'node_modules', '@img');
  for (const d of fs.readdirSync(img)) if (/^sharp-(libvips-)?(linux|linuxmusl|darwin|wasm32)/.test(d)) fs.rmSync(path.join(img, d), { recursive: true, force: true });
  for (const f of fs.readdirSync(path.join(app, 'locales'))) if (!/^en-(US|GB)\.pak$/.test(f)) fs.unlinkSync(path.join(app, 'locales', f));
  execFileSync(process.execPath, ['tests/stamp-exe.js', path.join(app, 'Batch Image Merger.exe'), 'ui/icon.ico', pkg.version], { stdio: 'inherit' });
  const zip = path.join(dist, `Batch-Image-Merger-v${pkg.version}.zip`);
  if (process.platform === 'win32') execFileSync('7z', ['a', '-tzip', '-mx=7', zip, 'App', 'READ ME FIRST.txt'], { cwd: dist, stdio: 'inherit' });
  else execFileSync('zip', ['-qr', '-9', zip, 'App', 'READ ME FIRST.txt'], { cwd: dist, stdio: 'inherit' });
  console.log('built', zip, (fs.statSync(zip).size / 1e6).toFixed(1) + ' MB');
})().catch((e) => { console.error(e); process.exit(1); });
