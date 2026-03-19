# Node 24 SEA 单可执行文件打包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 media-summ CLI 通过 Node 24 SEA 打包为 Linux/macOS/Windows 独立可执行文件

**Architecture:** esbuild 将 ESM 项目打包为单个 CJS bundle，Node 24 SEA 生成 blob 并注入到各平台 node 二进制中。构建脚本 `scripts/build-sea.ts` 统一编排整个流水线。

**Tech Stack:** esbuild, Node.js 24 SEA, postject

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `scripts/build-sea.ts` | 构建编排脚本（bundle + blob + inject） |
| Create | `sea-config.json` | SEA blob 生成配置 |
| Modify | `src/frameworks/index.ts` | 移除运行时 package.json 读取，改用构建时内联版本 |
| Modify | `package.json` | 新增 scripts 和 esbuild devDependency |
| Modify | `.gitignore` | 新增 `dist/bin/` 忽略项 |

---

### Task 1: 安装 esbuild 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 esbuild**

```bash
pnpm add -D esbuild
```

- [ ] **Step 2: 验证安装**

```bash
pnpm exec esbuild --version
```

Expected: 输出版本号如 `0.25.x`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add esbuild dev dependency"
```

---

### Task 2: 修改 index.ts — 移除运行时 package.json 读取

**Files:**
- Modify: `src/frameworks/index.ts:9-19`
- Test: 现有测试 `pnpm test`

- [ ] **Step 1: 写测试验证当前行为**

运行现有测试确认基线：

```bash
pnpm lint
```

Expected: 无错误

- [ ] **Step 2: 修改 index.ts**

将 `src/frameworks/index.ts` 的导入和版本读取改为：

```ts
#!/usr/bin/env node

/**
 * @module frameworks/index
 * @description CLI 入口 — 注册子命令 + 向后兼容（直接传 URL 自动转发到 download）
 * @depends cli/download
 */

import { Command } from 'commander';
import { registerDownload } from './download.js';
import { registerSummarize } from './summarize.js';
import { readFileSync } from 'node:fs';
import { loadConfig } from './config-loader.js';

declare const __APP_VERSION__: string | undefined;

const version =
  typeof __APP_VERSION__ !== 'undefined'
    ? __APP_VERSION__
    : JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')).version;

const program = new Command();

program
  .name('media-summ')
  .description('在线课程字幕下载与总结工具')
  .version(version);
```

保留 `readFileSync`（from `node:fs`）用于开发模式 fallback。

移除的导入：`fileURLToPath`（from `node:url`）、`dirname`、`join`（from `node:path`）。

移除的代码：`const __filename = ...`、`const __dirname = ...`、`const pkg = ...`。

注意：esbuild 的 `define` 会在 bundle 时将 `__APP_VERSION__` 替换为字符串字面量，`typeof` 检查会被优化为 `true` 分支，fallback 代码会被 tree-shake 掉。而普通 `node dist/` 开发模式下 `__APP_VERSION__` 未定义，走 fallback 从 package.json 读取。

其余代码（第 28-53 行）保持不变。

- [ ] **Step 3: 验证编译**

```bash
pnpm lint
```

Expected: 编译通过。`__APP_VERSION__` 是 `declare const`，TypeScript 不会报未定义。

- [ ] **Step 4: Commit**

```bash
git add src/frameworks/index.ts
git commit -m "refactor: inline version via build-time define, remove runtime package.json read"
```

---

### Task 3: 创建 sea-config.json

**Files:**
- Create: `sea-config.json`

- [ ] **Step 1: 创建配置文件**

```json
{
  "main": "dist/bundle.cjs",
  "output": "dist/sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useCodeCache": false
}
```

- [ ] **Step 2: Commit**

```bash
git add sea-config.json
git commit -m "chore: add SEA blob generation config"
```

---

### Task 4: 创建构建脚本 scripts/build-sea.ts

**Files:**
- Create: `scripts/build-sea.ts`

这是最核心的文件。脚本接受两种模式：
- `bundle`：仅执行 esbuild 打包（调试用）
- 默认（无参数）：完整流水线（bundle → blob → inject），支持 `--all` 构建全平台

- [ ] **Step 1: 创建 scripts 目录**

```bash
mkdir -p scripts
```

- [ ] **Step 2: 编写构建脚本**

创建 `scripts/build-sea.ts`：

```ts
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
    postSign: 'codesign --remove-signature', // 注入前需先移除 Apple 签名，注入后再重签
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
    execSync(`unzip -o "${archiveFile}" -d "${CACHE_DIR}"`, { stdio: 'inherit' });
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

  if (platform.postSign) {
    console.log(`[sign] ${platform.postSign} ${outputPath}`);
    execSync(`${platform.postSign} "${outputPath}"`, { stdio: 'inherit' });
  }

  const extra = platform.postjectExtra?.join(' ') ?? '';
  const cmd = `pnpm dlx postject "${outputPath}" NODE_SEA_BLOB "${BLOB_OUT}" --sentinel-fuse ${SENTINEL} ${extra}`.trim();
  console.log(`[inject] ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });

  if (platform.name.startsWith('darwin')) {
    console.log(`[sign] codesign --sign - ${outputPath}`);
    execSync(`codesign --sign - "${outputPath}"`, { stdio: 'inherit' });
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
```

- [ ] **Step 3: 验证脚本可运行（冒烟测试）**

```bash
node --experimental-strip-types scripts/build-sea.ts bundle
```

Expected: 先执行 tsc 编译，然后 esbuild 打包成功，输出 `bundle-only mode. Output: .../dist/bundle.cjs`

- [ ] **Step 4: Commit**

```bash
git add scripts/build-sea.ts
git commit -m "feat: add SEA build script for cross-platform packaging"
```

---

### Task 5: 更新 package.json scripts 和 .gitignore

**Files:**
- Modify: `package.json:5-9`（scripts 部分）
- Modify: `.gitignore`

- [ ] **Step 1: 更新 package.json scripts**

在 `scripts` 中新增：

```json
{
  "scripts": {
    "build": "tsc",
    "build:bundle": "node --experimental-strip-types scripts/build-sea.ts bundle",
    "build:sea": "node --experimental-strip-types scripts/build-sea.ts",
    "start": "node dist/frameworks/index.js",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: 更新 .gitignore**

在文件末尾 `# This project files` 部分追加：

```
dist/bin/
```

注意：`.cache/` 已在 .gitignore 中存在（第 74 行和第 87 行），无需重复添加。Spec 中列出了 `.cache/` 但此处有意跳过。

- [ ] **Step 3: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: add build:sea and build:bundle scripts, update gitignore"
```

---

### Task 6: 端到端验证 — 当前平台构建

**Files:** 无新文件

注意：构建脚本的 `downloadFile` 使用原生 `node:https.get`，不支持 `HTTPS_PROXY` 代理。如果需要代理才能访问 nodejs.org，可手动下载 node 二进制到 `.cache/node-bins/` 目录。

- [ ] **Step 1: 执行完整构建**

```bash
pnpm build:sea
```

Expected: 输出类似：
```
[tsc] compiling TypeScript...
[bundle] esbuild → /home/code/media-summ/dist/bundle.cjs
[bundle] done
[blob] generating SEA preparation blob...
[blob] done
[download] cached: ...  (或下载)
[inject] pnpm dlx postject ...
[done] /home/code/media-summ/dist/bin/media-summ-linux-x64
build complete. Binaries in .../dist/bin/
```

- [ ] **Step 2: 验证可执行文件**

```bash
./dist/bin/media-summ-linux-x64 --version
```

Expected: `1.0.0`

```bash
./dist/bin/media-summ-linux-x64 --help
```

Expected: 显示帮助信息，包含 `media-summ` 名称和 `download`/`summarize` 子命令

- [ ] **Step 3: 验证 bundle-only 模式**

```bash
pnpm build:bundle
```

Expected: 生成 `dist/bundle.cjs`，不生成 blob 或二进制

- [ ] **Step 4: 检查产物体积**

```bash
ls -lh dist/bundle.cjs dist/bin/media-summ-linux-x64
```

Expected: bundle ~2-5MB，可执行文件 ~70-95MB

- [ ] **Step 5: Commit（如有修复）**

如果前面步骤发现问题并修复了，提交修复：

```bash
git add scripts/build-sea.ts src/frameworks/index.ts sea-config.json
git commit -m "fix: address issues found during SEA build verification"
```
