import { buildSync } from 'esbuild';
import { execSync } from 'node:child_process';
import { readFileSync, copyFileSync, mkdirSync, existsSync, chmodSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { get } from 'node:https';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const BIN_DIR = join(DIST, 'bin');
const CACHE_DIR = join(ROOT, '.cache', 'node-bins');
const BUNDLE_OUT = join(DIST, 'bundle.cjs');
const BLOB_OUT = join(DIST, 'sea-prep.blob');

interface Platform {
  name: string;
  nodeDir: string;
  nodeBin: string;
  outputName: string;
  postSign?: string;
  postjectExtra?: string[];
}

const NODE_VERSION = process.version;

const PLATFORMS: Record<string, Platform> = {
  'linux-x64': {
    name: 'linux-x64',
    nodeDir: `node-${NODE_VERSION}-linux-x64`,
    nodeBin: 'bin/node',
    outputName: 'media-summ-linux-x64',
  },
  'darwin-arm64': {
    name: 'darwin-arm64',
    nodeDir: `node-${NODE_VERSION}-darwin-arm64`,
    nodeBin: 'bin/node',
    outputName: 'media-summ-darwin-arm64',
    postSign: 'codesign --remove-signature',
  },
  'win32-x64': {
    name: 'win32-x64',
    nodeDir: `node-${NODE_VERSION}-win-x64`,
    nodeBin: 'node.exe',
    outputName: 'media-summ-win-x64.exe',
    postjectExtra: ['--overwrite'],
  },
};

const SENTINEL = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  return pkg.version;
}

function bundle(version: string): void {
  console.log(`[bundle] esbuild → ${BUNDLE_OUT}`);
  buildSync({
    entryPoints: [join(DIST, 'frameworks', 'index.js')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node24',
    outfile: BUNDLE_OUT,
    define: { '__APP_VERSION__': JSON.stringify(version) },
  });
  console.log('[bundle] done');
}

function generateBlob(): void {
  console.log('[blob] generating SEA preparation blob...');
  execSync('node --experimental-sea-config sea-config.json', {
    cwd: ROOT,
    stdio: 'inherit',
  });
  console.log('[blob] done');
}

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        downloadFile(res.headers.location!, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode} for ${url}`));
        return;
      }
      const ws = createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(); resolve(); });
      ws.on('error', reject);
    }).on('error', reject);
  });
}

async function ensureNodeBinary(platform: Platform): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });

  const isWin = platform.name.startsWith('win32');
  const ext = isWin ? 'zip' : 'tar.gz';
  const archiveFile = join(CACHE_DIR, `${platform.nodeDir}.${ext}`);
  const extractedDir = join(CACHE_DIR, platform.nodeDir);
  const nodeBinPath = join(extractedDir, platform.nodeBin);

  if (existsSync(nodeBinPath)) {
    console.log(`[download] cached: ${nodeBinPath}`);
    return nodeBinPath;
  }

  const url = `https://nodejs.org/dist/${NODE_VERSION}/${platform.nodeDir}.${ext}`;
  console.log(`[download] ${url}`);
  await downloadFile(url, archiveFile);

  console.log(`[extract] ${archiveFile}`);
  if (isWin) {
    try {
      execSync(`unzip -o "${archiveFile}" -d "${CACHE_DIR}"`, { stdio: 'inherit' });
    } catch {
      execSync(`python3 -c "import zipfile; zipfile.ZipFile('${archiveFile}').extractall('${CACHE_DIR}')"`, { stdio: 'inherit' });
    }
  } else {
    execSync(`tar -xzf "${archiveFile}" -C "${CACHE_DIR}"`, { stdio: 'inherit' });
  }

  return nodeBinPath;
}

function injectBlob(nodeBinPath: string, platform: Platform): string {
  mkdirSync(BIN_DIR, { recursive: true });
  const outputPath = join(BIN_DIR, platform.outputName);

  copyFileSync(nodeBinPath, outputPath);
  if (!platform.name.startsWith('win32')) {
    chmodSync(outputPath, 0o755);
  }

  const onMacOS = process.platform === 'darwin';

  if (platform.postSign && onMacOS) {
    console.log(`[sign] ${platform.postSign} ${outputPath}`);
    execSync(`${platform.postSign} "${outputPath}"`, { stdio: 'inherit' });
  } else if (platform.postSign) {
    console.log(`[sign] skipped (not on macOS): ${platform.postSign}`);
  }

  const extra = platform.postjectExtra?.join(' ') ?? '';
  const cmd = `pnpm dlx postject "${outputPath}" NODE_SEA_BLOB "${BLOB_OUT}" --sentinel-fuse ${SENTINEL} ${extra}`.trim();
  console.log(`[inject] ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });

  if (platform.name.startsWith('darwin') && onMacOS) {
    console.log(`[sign] codesign --sign - ${outputPath}`);
    execSync(`codesign --sign - "${outputPath}"`, { stdio: 'inherit' });
  } else if (platform.name.startsWith('darwin')) {
    console.log(`[sign] skipped (not on macOS): codesign --sign -`);
  }

  console.log(`[done] ${outputPath}`);
  return outputPath;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args[0];
  const version = readVersion();

  // tsc 编译
  console.log('[tsc] compiling TypeScript...');
  execSync('pnpm build', { cwd: ROOT, stdio: 'inherit' });

  // esbuild 打包
  bundle(version);

  if (mode === 'bundle') {
    console.log(`\nbundle-only mode. Output: ${BUNDLE_OUT}`);
    return;
  }

  // 生成 SEA blob
  generateBlob();

  // 确定目标平台
  const buildAll = args.includes('--all');
  const currentPlatform = `${process.platform}-${process.arch}`;
  const targets = buildAll
    ? Object.values(PLATFORMS)
    : [PLATFORMS[currentPlatform]].filter(Boolean);

  if (targets.length === 0) {
    console.error(`unsupported platform: ${currentPlatform}`);
    process.exit(1);
  }

  // 下载 node 二进制 + 注入
  for (const target of targets) {
    const nodeBin = await ensureNodeBinary(target);
    injectBlob(nodeBin, target);
  }

  console.log(`\nbuild complete. Binaries in ${BIN_DIR}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
