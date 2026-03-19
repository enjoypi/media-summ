# npm 平台特定二进制分发 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 media-summ CLI 以 esbuild 模式（optionalDependencies）发布到 npm，用户通过 `npm install -g @enjoypi/media-summ` 获得平台特定 SEA 二进制

**Architecture:** 主包 `@enjoypi/media-summ` 含 JS bin wrapper，通过 optionalDependencies 引用三个平台子包（linux-x64, darwin-arm64, win32-x64）。npm 按 os/cpu 字段自动过滤，只安装匹配平台的子包。发布脚本从根 package.json 同步版本，复制 SEA 二进制到各子包，按顺序 npm publish。

**Tech Stack:** Node.js 24 SEA, esbuild, npm registry

**Spec:** `docs/superpowers/specs/2026-03-19-npm-platform-binary-distribution-design.md`

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `npm/media-summ/package.json` | 主包元数据：bin, optionalDependencies |
| Create | `npm/media-summ/bin/media-summ` | JS wrapper：检测平台 → execFileSync 二进制 |
| Create | `npm/media-summ-linux-x64/package.json` | 平台包元数据：os:linux, cpu:x64 |
| Create | `npm/media-summ-darwin-arm64/package.json` | 平台包元数据：os:darwin, cpu:arm64 |
| Create | `npm/media-summ-win32-x64/package.json` | 平台包元数据：os:win32, cpu:x64 |
| Create | `scripts/publish.ts` | 发布脚本：版本同步 + 二进制复制 + npm publish |
| Create | `npm/media-summ/bin/media-summ.test.ts` | bin wrapper 单元测试 |
| Create | `scripts/publish.test.ts` | 发布脚本单元测试 |
| Modify | `package.json:5-12` | 新增 `publish-packages` script |
| Create | `npm/media-summ-linux-x64/bin/.gitignore` | 忽略构建时复制的二进制 |
| Create | `npm/media-summ-darwin-arm64/bin/.gitignore` | 忽略构建时复制的二进制 |
| Create | `npm/media-summ-win32-x64/bin/.gitignore` | 忽略构建时复制的二进制 |

---

### Task 1: 创建三个平台子包的 package.json

**Files:**
- Create: `npm/media-summ-linux-x64/package.json`
- Create: `npm/media-summ-darwin-arm64/package.json`
- Create: `npm/media-summ-win32-x64/package.json`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p npm/media-summ-linux-x64/bin npm/media-summ-darwin-arm64/bin npm/media-summ-win32-x64/bin
```

- [ ] **Step 2: 创建 linux-x64 package.json**

创建 `npm/media-summ-linux-x64/package.json`：

```json
{
  "name": "@enjoypi/media-summ-linux-x64",
  "version": "0.0.0",
  "description": "Platform-specific binary for @enjoypi/media-summ (linux-x64)",
  "os": ["linux"],
  "cpu": ["x64"],
  "files": ["bin"]
}
```

- [ ] **Step 3: 创建 darwin-arm64 package.json**

创建 `npm/media-summ-darwin-arm64/package.json`：

```json
{
  "name": "@enjoypi/media-summ-darwin-arm64",
  "version": "0.0.0",
  "description": "Platform-specific binary for @enjoypi/media-summ (darwin-arm64)",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "files": ["bin"]
}
```

- [ ] **Step 4: 创建 win32-x64 package.json**

创建 `npm/media-summ-win32-x64/package.json`：

```json
{
  "name": "@enjoypi/media-summ-win32-x64",
  "version": "0.0.0",
  "description": "Platform-specific binary for @enjoypi/media-summ (win32-x64)",
  "os": ["win32"],
  "cpu": ["x64"],
  "files": ["bin"]
}
```

- [ ] **Step 5: 在各 bin/ 目录放置 .gitkeep**

```bash
touch npm/media-summ-linux-x64/bin/.gitkeep npm/media-summ-darwin-arm64/bin/.gitkeep npm/media-summ-win32-x64/bin/.gitkeep
```

- [ ] **Step 6: Commit**

```bash
git add npm/media-summ-linux-x64 npm/media-summ-darwin-arm64 npm/media-summ-win32-x64
git commit -m "chore: add platform-specific npm package scaffolding"
```

---

### Task 2: 创建 bin wrapper 及其测试

**Files:**
- Create: `npm/media-summ/package.json`
- Create: `npm/media-summ/bin/media-summ`
- Create: `npm/media-summ/bin/media-summ.test.ts`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p npm/media-summ/bin
```

- [ ] **Step 2: 写 bin wrapper 的测试**

创建 `npm/media-summ/bin/media-summ.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const WRAPPER_PATH = join(import.meta.dirname, 'media-summ');

describe('bin wrapper', () => {
  it('exits with error message on unsupported platform', () => {
    // wrapper 在测试环境中找不到平台包，应报错退出
    try {
      execFileSync('node', [WRAPPER_PATH], {
        env: { ...process.env },
        encoding: 'utf-8',
      });
      expect.unreachable('should have thrown');
    } catch (err: any) {
      expect(err.status).not.toBe(0);
      expect(err.stderr.toString()).toMatch(/media-summ/i);
    }
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
pnpm test npm/media-summ/bin/media-summ.test.ts
```

Expected: FAIL — `media-summ` 文件不存在

- [ ] **Step 4: 创建 bin wrapper**

创建 `npm/media-summ/bin/media-summ`：

```js
#!/usr/bin/env node

"use strict";

const { execFileSync } = require("child_process");
const os = require("os");
const path = require("path");

const PLATFORMS = {
  "linux-x64": "@enjoypi/media-summ-linux-x64",
  "darwin-arm64": "@enjoypi/media-summ-darwin-arm64",
  "win32-x64": "@enjoypi/media-summ-win32-x64",
};

const platformKey = `${process.platform}-${os.arch()}`;
const pkg = PLATFORMS[platformKey];

if (!pkg) {
  console.error(
    `@enjoypi/media-summ: unsupported platform ${platformKey}.\n` +
    `Supported: ${Object.keys(PLATFORMS).join(", ")}`
  );
  process.exit(1);
}

const binName = process.platform === "win32" ? "media-summ.exe" : "media-summ";

let binPath;
try {
  const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
  binPath = path.join(pkgDir, "bin", binName);
} catch {
  console.error(
    `@enjoypi/media-summ: could not find ${pkg}.\n` +
    `Try reinstalling: npm install -g @enjoypi/media-summ`
  );
  process.exit(1);
}

try {
  execFileSync(binPath, process.argv.slice(2), { stdio: "inherit" });
} catch (err) {
  if (err && typeof err === "object" && "status" in err && err.status !== null) {
    process.exitCode = err.status;
  } else {
    process.exitCode = 1;
  }
}
```

- [ ] **Step 5: 设置可执行权限**

```bash
chmod +x npm/media-summ/bin/media-summ
```

- [ ] **Step 6: 创建主包 package.json**

创建 `npm/media-summ/package.json`：

```json
{
  "name": "@enjoypi/media-summ",
  "version": "0.0.0",
  "description": "Media subtitle downloader and summarizer",
  "bin": {
    "media-summ": "bin/media-summ"
  },
  "files": ["bin/media-summ"],
  "optionalDependencies": {
    "@enjoypi/media-summ-linux-x64": "0.0.0",
    "@enjoypi/media-summ-darwin-arm64": "0.0.0",
    "@enjoypi/media-summ-win32-x64": "0.0.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/enjoypi/media-summ"
  },
  "license": "ISC"
}
```

- [ ] **Step 7: 运行测试确认通过**

```bash
pnpm test npm/media-summ/bin/media-summ.test.ts
```

Expected: PASS — wrapper 找不到平台包时正确报错退出

- [ ] **Step 8: Commit**

```bash
git add npm/media-summ
git commit -m "feat: add npm main package with bin wrapper"
```

---

### Task 3: 创建发布脚本及其测试

**Files:**
- Create: `scripts/publish.ts`
- Create: `scripts/publish.test.ts`
- Modify: `package.json:5-12`

- [ ] **Step 1: 写发布脚本的测试**

创建 `scripts/publish.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..');
const FIXTURES = join(import.meta.dirname, '__test_fixtures__');

describe('publish script', () => {
  beforeEach(() => {
    mkdirSync(FIXTURES, { recursive: true });
  });

  afterEach(() => {
    rmSync(FIXTURES, { recursive: true, force: true });
  });

  describe('PLATFORM_MAP', () => {
    it('maps SEA output names to npm package directories', async () => {
      // 验证映射表与 build-sea.ts 的 outputName 一致
      const { PLATFORM_MAP } = await import('./publish.ts');
      expect(PLATFORM_MAP).toEqual([
        {
          seaOutput: 'media-summ-linux-x64',
          npmDir: 'media-summ-linux-x64',
          binName: 'media-summ',
        },
        {
          seaOutput: 'media-summ-darwin-arm64',
          npmDir: 'media-summ-darwin-arm64',
          binName: 'media-summ',
        },
        {
          seaOutput: 'media-summ-win-x64.exe',
          npmDir: 'media-summ-win32-x64',
          binName: 'media-summ.exe',
        },
      ]);
    });
  });

  describe('syncVersions', () => {
    it('writes version to all npm package.json files', async () => {
      const { syncVersions } = await import('./publish.ts');

      // 创建模拟的 npm 包目录
      const npmDir = join(FIXTURES, 'npm');
      const pkgDir = join(npmDir, 'test-pkg');
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({ name: '@test/pkg', version: '0.0.0' }),
      );

      syncVersions('1.2.3', npmDir, [{ npmDir: 'test-pkg' }]);

      const result = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
      expect(result.version).toBe('1.2.3');
    });

    it('updates optionalDependencies versions in main package', async () => {
      const { syncVersions } = await import('./publish.ts');

      const npmDir = join(FIXTURES, 'npm');
      const mainDir = join(npmDir, 'media-summ');
      mkdirSync(mainDir, { recursive: true });
      writeFileSync(
        join(mainDir, 'package.json'),
        JSON.stringify({
          name: '@enjoypi/media-summ',
          version: '0.0.0',
          optionalDependencies: {
            '@enjoypi/media-summ-linux-x64': '0.0.0',
          },
        }),
      );

      syncVersions('2.0.0', npmDir, [{ npmDir: 'media-summ' }]);

      const result = JSON.parse(readFileSync(join(mainDir, 'package.json'), 'utf-8'));
      expect(result.version).toBe('2.0.0');
      expect(result.optionalDependencies['@enjoypi/media-summ-linux-x64']).toBe('2.0.0');
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test scripts/publish.test.ts
```

Expected: FAIL — `./publish.js` 不存在

- [ ] **Step 3: 编写发布脚本**

创建 `scripts/publish.ts`：

```ts
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..');
const DIST_BIN = join(ROOT, 'dist', 'bin');
const NPM_DIR = join(ROOT, 'npm');

interface PlatformEntry {
  seaOutput: string;
  npmDir: string;
  binName: string;
}

export const PLATFORM_MAP: PlatformEntry[] = [
  {
    seaOutput: 'media-summ-linux-x64',
    npmDir: 'media-summ-linux-x64',
    binName: 'media-summ',
  },
  {
    seaOutput: 'media-summ-darwin-arm64',
    npmDir: 'media-summ-darwin-arm64',
    binName: 'media-summ',
  },
  {
    seaOutput: 'media-summ-win-x64.exe',
    npmDir: 'media-summ-win32-x64',
    binName: 'media-summ.exe',
  },
];

const MAIN_PKG_DIR = 'media-summ';

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  return pkg.version;
}

export function syncVersions(
  version: string,
  npmRoot: string,
  packages: { npmDir: string }[],
): void {
  for (const pkg of packages) {
    const pkgJsonPath = join(npmRoot, pkg.npmDir, 'package.json');
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    pkgJson.version = version;

    if (pkgJson.optionalDependencies) {
      for (const dep of Object.keys(pkgJson.optionalDependencies)) {
        pkgJson.optionalDependencies[dep] = version;
      }
    }

    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
    console.log(`[version] ${pkg.npmDir} → ${version}`);
  }
}

function checkBinaries(): void {
  const missing: string[] = [];
  for (const entry of PLATFORM_MAP) {
    const binPath = join(DIST_BIN, entry.seaOutput);
    if (!existsSync(binPath)) {
      missing.push(entry.seaOutput);
    }
  }
  if (missing.length > 0) {
    console.error(`[error] missing binaries in dist/bin/:\n  ${missing.join('\n  ')}`);
    console.error(`\nRun: pnpm build:sea -- --all`);
    process.exit(1);
  }
}

function copyBinaries(): void {
  for (const entry of PLATFORM_MAP) {
    const src = join(DIST_BIN, entry.seaOutput);
    const destDir = join(NPM_DIR, entry.npmDir, 'bin');
    mkdirSync(destDir, { recursive: true });
    const dest = join(destDir, entry.binName);
    copyFileSync(src, dest);
    console.log(`[copy] ${entry.seaOutput} → npm/${entry.npmDir}/bin/${entry.binName}`);
  }
}

function publishPackages(dryRun: boolean): void {
  const flag = dryRun ? ' --dry-run' : '';
  const published: string[] = [];
  const failed: string[] = [];

  // 先发平台包，最后发主包
  const order = [
    ...PLATFORM_MAP.map((e) => e.npmDir),
    MAIN_PKG_DIR,
  ];

  for (const dir of order) {
    const cwd = join(NPM_DIR, dir);
    const cmd = `npm publish --access public${flag}`;
    console.log(`\n[publish] ${dir}: ${cmd}`);
    try {
      execSync(cmd, { cwd, stdio: 'inherit' });
      published.push(dir);
    } catch {
      failed.push(dir);
      console.error(`\n[error] failed to publish ${dir}`);
      if (!dryRun) {
        console.error(`[status] published: ${published.join(', ') || 'none'}`);
        console.error(`[status] failed: ${failed.join(', ')}`);
        console.error(`[status] remaining: ${order.slice(published.length + failed.length).join(', ') || 'none'}`);
      }
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log('\n[dry-run] all packages validated successfully');
  } else {
    console.log('\n[done] all packages published successfully');
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipDryRun = args.includes('--yes');

  const version = readVersion();
  console.log(`[version] ${version}`);

  checkBinaries();

  const allPackages = [
    ...PLATFORM_MAP.map((e) => ({ npmDir: e.npmDir })),
    { npmDir: MAIN_PKG_DIR },
  ];
  syncVersions(version, NPM_DIR, allPackages);

  copyBinaries();

  if (dryRun) {
    publishPackages(true);
    return;
  }

  if (!skipDryRun) {
    console.log('\n[dry-run] validating packages...');
    publishPackages(true);
    console.log('\n[publish] proceeding with actual publish...');
  }

  publishPackages(false);
}

main();
```

- [ ] **Step 4: 运行测试**

```bash
pnpm test scripts/publish.test.ts
```

Expected: PASS

注意：`scripts/publish.ts` 不在 `src/` 中，tsc 不会编译它。vitest 自身的 transform pipeline 会处理 `.ts` 文件，所以测试中 `import('./publish.ts')` 可以正常工作。

- [ ] **Step 5: 在 package.json 中添加 publish-packages script**

在 `package.json` 的 `scripts` 中添加：

```json
"publish-packages": "node --experimental-strip-types scripts/publish.ts"
```

完整 scripts 部分应为：

```json
"scripts": {
  "build": "tsc",
  "build:bundle": "node --experimental-strip-types scripts/build-sea.ts bundle",
  "build:sea": "node --experimental-strip-types scripts/build-sea.ts",
  "start": "node dist/frameworks/index.js",
  "test": "vitest run",
  "lint": "tsc --noEmit",
  "publish-packages": "node --experimental-strip-types scripts/publish.ts"
}
```

- [ ] **Step 6: Commit**

```bash
git add scripts/publish.ts scripts/publish.test.ts package.json
git commit -m "feat: add publish script for npm platform binary distribution"
```

---

### Task 4: 添加 npm 平台包的 bin/.gitignore

**Files:**
- Create: `npm/media-summ-linux-x64/bin/.gitignore`
- Create: `npm/media-summ-darwin-arm64/bin/.gitignore`
- Create: `npm/media-summ-win32-x64/bin/.gitignore`

- [ ] **Step 1: 在各平台包的 bin/ 目录添加 .gitignore**

忽略构建时复制进来的二进制文件，但保留 .gitkeep：

创建 `npm/media-summ-linux-x64/bin/.gitignore`：

```
media-summ
```

创建 `npm/media-summ-darwin-arm64/bin/.gitignore`：

```
media-summ
```

创建 `npm/media-summ-win32-x64/bin/.gitignore`：

```
media-summ.exe
```

- [ ] **Step 2: 删除之前创建的 .gitkeep 文件**

```bash
rm -f npm/media-summ-linux-x64/bin/.gitkeep npm/media-summ-darwin-arm64/bin/.gitkeep npm/media-summ-win32-x64/bin/.gitkeep
```

.gitignore 文件本身会让 git 跟踪 bin/ 目录，不再需要 .gitkeep。

- [ ] **Step 3: Commit**

```bash
git add npm/media-summ-linux-x64/bin/.gitignore npm/media-summ-darwin-arm64/bin/.gitignore npm/media-summ-win32-x64/bin/.gitignore
git rm -f --cached npm/media-summ-linux-x64/bin/.gitkeep npm/media-summ-darwin-arm64/bin/.gitkeep npm/media-summ-win32-x64/bin/.gitkeep 2>/dev/null; true
git commit -m "chore: add .gitignore for platform binary directories"
```

---

### Task 5: 端到端验证 — dry-run 发布

**Files:** 无新文件

前置条件：已执行 `pnpm build:sea -- --all` 生成三平台二进制（或至少当前平台的二进制用于冒烟测试）。

- [ ] **Step 1: 构建当前平台 SEA 二进制**

```bash
pnpm build:sea
```

Expected: 在 `dist/bin/` 下生成当前平台的二进制

- [ ] **Step 2: 运行 dry-run 发布（预期失败 — 缺少其他平台二进制）**

```bash
pnpm run publish-packages -- --dry-run
```

Expected: 报错提示缺少其他平台的二进制文件（`checkBinaries` 在 `syncVersions` 之前执行，所以版本不会被同步）。这验证了 checkBinaries 逻辑正确。

- [ ] **Step 3: 手动验证版本同步**

由于 Step 2 中 `checkBinaries` 失败导致 `syncVersions` 未执行，手动运行一次版本同步验证：

先创建假的二进制文件用于测试（后续删除）：

```bash
touch dist/bin/media-summ-linux-x64 dist/bin/media-summ-darwin-arm64 dist/bin/media-summ-win-x64.exe
pnpm run publish-packages -- --dry-run
```

Expected: 版本同步成功，dry-run publish 可能因未登录 npm 而失败，但 `npm/*/package.json` 中的版本号应已更新。

```bash
grep '"version"' npm/*/package.json
```

Expected: 所有包的 version 都是根 package.json 中的版本号（`1.0.0`）

清理假文件：

```bash
rm -f dist/bin/media-summ-linux-x64 dist/bin/media-summ-darwin-arm64 dist/bin/media-summ-win-x64.exe
```

- [ ] **Step 4: 运行全部测试确认无回归**

```bash
pnpm test
```

Expected: 所有测试通过

- [ ] **Step 5: Commit（如有修复）**

如果前面步骤发现问题并修复了：

```bash
git add scripts/publish.ts scripts/publish.test.ts npm/
git commit -m "fix: address issues found during publish dry-run verification"
```
