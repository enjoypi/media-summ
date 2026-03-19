# Node 24 SEA 单可执行文件打包设计

## 概述

将 media-summ CLI 工具通过 Node.js 24 Single Executable Application (SEA) 打包为独立可执行文件，支持 Linux x64、macOS arm64、Windows x64 三平台。

## 目标

- 产出无需 Node.js 运行时的独立可执行文件
- 配置文件（config.yaml、cookies.txt）保持外部，用户自行放置
- 仅本地构建使用，不涉及公开分发

## 构建流水线

```
pnpm build (tsc: TS → JS)
    ↓
esbuild bundle (dist/frameworks/index.js → dist/bundle.cjs)
    ↓
node --experimental-sea-config sea-config.json → dist/sea-prep.blob
    ↓
复制目标平台 node 二进制 → dist/bin/media-summ[-platform]
    ↓
postject 注入 blob
    ↓
平台签名（macOS: codesign --sign -）
```

### esbuild 配置

- `entryPoints`: `['dist/frameworks/index.js']`
- `bundle`: `true`
- `format`: `'cjs'`（SEA 对 CJS 支持最稳定）
- `platform`: `'node'`
- `target`: `'node24'`
- `outfile`: `'dist/bundle.cjs'`
- `define`: `{ '__APP_VERSION__': JSON.stringify(version) }`（从 package.json 读取，构建时内联）
- `banner.js`: `createRequire` polyfill（处理某些 node_modules 的 CJS require）

### sea-config.json

```json
{
  "main": "dist/bundle.cjs",
  "output": "dist/sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useCodeCache": false
}
```

`useCodeCache` 设为 false，因为 openai SDK 内部可能有动态 `import()`。

## 代码改动

### src/frameworks/index.ts

唯一需要修改的源文件。消除运行时读取 package.json：

```ts
// 之前：
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
program.version(pkg.version);

// 之后：
declare const __APP_VERSION__: string;
program.version(__APP_VERSION__);
```

移除不再需要的导入：`readFileSync`、`fileURLToPath`、`dirname`、`join`（如果其他地方未使用）。

### 无需改动的文件

- `config-loader.ts`：使用 `process.cwd()` 和 `homedir()` 查找 config.yaml，SEA 模式下正常工作
- 其他所有源文件：无路径依赖问题

## 跨平台构建

### 目标平台

| 平台 | 架构 | 产物名 |
|------|------|--------|
| Linux | x64 | `media-summ-linux-x64` |
| macOS | arm64 | `media-summ-darwin-arm64` |
| Windows | x64 | `media-summ-win-x64.exe` |

### Node 二进制获取

从 `https://nodejs.org/dist/` 下载对应平台的 node 二进制，缓存到 `.cache/node-bins/` 避免重复下载。

### 平台特殊处理

- **macOS**：postject 注入后需 `codesign --sign -` 重签名
- **Windows**：postject 需要 `--overwrite` 标志

## 构建脚本

新增 `scripts/build-sea.ts`，通过 Node 24 `--experimental-strip-types` 直接运行。

### 命令

```bash
pnpm build:sea              # 构建当前平台
pnpm build:sea -- --all     # 构建全部三平台
```

### 脚本职责

1. 读取 package.json 版本号
2. 调用 esbuild 打包（内联版本号）
3. 生成 SEA blob
4. 下载/缓存目标平台 node 二进制
5. 复制二进制 + postject 注入
6. 平台签名
7. 输出到 `dist/bin/`

### package.json 新增

```json
{
  "scripts": {
    "build:bundle": "node --experimental-strip-types scripts/build-sea.ts bundle",
    "build:sea": "node --experimental-strip-types scripts/build-sea.ts"
  },
  "devDependencies": {
    "esbuild": "^0.25.x"
  }
}
```

`postject` 通过 `pnpm dlx postject` 调用，无需安装为依赖。

## 产物结构

```
dist/
├── bin/
│   ├── media-summ-linux-x64
│   ├── media-summ-darwin-arm64
│   └── media-summ-win-x64.exe
├── bundle.cjs
└── sea-prep.blob
```

## 运行时文件布局

用户使用时的目录结构：

```
./
├── media-summ          # 可执行文件
├── config.yaml         # 配置文件（必需）
├── cookies.txt         # Cookie 文件（download 子命令必需）
└── subtitles/          # 输出目录
```

或将 config.yaml 放在 `~/.media-summ/config.yaml`。

## 不在范围内

- CI/CD 自动构建
- GitHub Releases 发布
- npm 全局安装包
- 自动更新机制
- config.yaml 内嵌
