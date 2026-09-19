// 建立部署版本 zip —  node scripts/pack.mjs
//
// 建立一份讓接收者解壓縮後上傳到 Vercel 就能直接使用的原始碼套件。
// 排除 node_modules·.next·.git·個人設定（ohome.config.json、.env*）。
import { createWriteStream } from 'node:fs';
import { readdir, stat, readFile, mkdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT_DIR = join(root, 'dist');

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', '.vercel', 'coverage']);
const SKIP_FILES = new Set([
  'ohome.config.json',      // 部署者的 DB 連接資訊 — 絕對不會一起放入
  '.env', '.env.local', '.env.production',
  'tsconfig.tsbuildinfo', '.claude-launch-check', '.DS_Store',
]);

async function walk(dir, zip, base) {
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    const rel = relative(base, full).split(sep).join('/');
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) continue;
    const s = await stat(full);
    if (s.isDirectory()) await walk(full, zip, base);
    else zip.file(rel, await readFile(full));
  }
}

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const zip = new JSZip();
await walk(root, zip, root);

await mkdir(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const out = join(OUT_DIR, `ohome-${pkg.version ?? '1.0.0'}-${stamp}.zip`);
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
await new Promise((res, rej) => {
  const w = createWriteStream(out);
  w.on('finish', res); w.on('error', rej);
  w.end(buf);
});

const files = Object.keys(zip.files).filter(f => !zip.files[f].dir).length;
console.log(`部署版本已建立: ${relative(root, out)}  (檔案 ${files} 個 · ${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
console.log('接收者：解壓縮 → 上傳至 GitHub → Vercel Import → 進入網站後顯示安裝畫面');