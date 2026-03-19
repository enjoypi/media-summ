# npm 平台特定二进制分发设计

## 概述

将 media-summ CLI 以平台特定二进制的形式发布到 npm registry，用户通过 `npm install -g @enjoypi/media-summ` 安装，无需 Node.js 运行时。

## 方案

采用 esbuild 模式（optionalDependencies），这是 esbuild、turbo、lightningcss 等项目验证过的业界标准模式。

## 目标平台

- linux-x64
- darwin-arm64
- win32-x64

## 包结构

| 包名 | 内容 | os | cpu |
|------|------|----|-----|
| `@enjoypi/media-summ` | JS bin wrapper | 无限制 | 无限制 |
| `@enjoypi/media-summ-linux-x64` | SEA 二进制 | linux | x64 |
| `@enjoypi/media-summ-darwin-arm64` | SEA 二进制 | darwin | arm64 |
| `@enjoypi/media-summ-win32-x64` | SEA 二进制 (.exe) | win32 | x64 |

主包通过 `optionalDependencies` 引用三个平台包。npm 安装时自动按 `os`/`cpu` 字段过滤，只安装匹配当前平台的子包。

## 目录结构

在项目根目录新增 `npm/` 目录：

```
npm/
├── media-summ/                    # 主包
│   ├── package.json               # bin, optionalDependencies
│   └── bin/
│       └── media-summ             # JS wrapper 脚本
├── media-summ-linux-x64/
│   ├── package.json               # os:linux, cpu:x64
│   └── bin/                       # 构建时复制二进制到此
├── media-summ-darwin-arm64/
│   ├── package.json               # os:darwin, cpu:arm64
│   └── bin/
└── media-summ-win32-x64/
    ├── package.json               # os:win32, cpu:x64
    └── bin/
```

## package.json 模板

### 主包 `npm/media-summ/package.json`

```json
{
  "name": "@enjoypi/media-summ",
  "version": "0.0.0",
  "description": "Media subtitle downloader and summarizer",
  "bin": {
    "media-summ": "bin/media-summ"
  },
  "files": ["bin"],
  "optionalDependencies": {
    "@enjoypi/media-summ-linux-x64": "0.0.0",
    "@enjoypi/media-summ-darwin-arm64": "0.0.0",
    "@enjoypi/media-summ-win32-x64": "0.0.0"
  }
}
```

### 平台子包 `npm/media-summ-linux-x64/package.json`（示例）

```json
{
  "name": "@enjoypi/media-summ-linux-x64",
  "version": "0.0.0",
  "os": ["linux"],
  "cpu": ["x64"],
  "files": ["bin"]
}
```

darwin-arm64 和 win32-x64 同理，替换 `name`/`os`/`cpu`。

## bin wrapper

`npm/media-summ/bin/media-summ` 是一个 JS 脚本（`#!/usr/bin/env node`）：

1. 根据 `process.platform` + `process.arch` 拼出平台包名
2. `require.resolve('@enjoypi/media-summ-<platform>/package.json')` 定位包目录，再拼接 `../bin/<binary>` 得到二进制路径
3. `child_process.execFileSync` 执行，透传 `process.argv.slice(2)` 和 `stdio: "inherit"`
4. try/catch 捕获异常，通过 `process.exitCode` 透传子进程退出码（避免暴露 Node.js 堆栈）
5. 不支持的平台直接报错退出

不做 postinstall fallback，保持简单。如果 optionalDependencies 安装失败，报错提示重装。

## 发布脚本

新增 `scripts/publish.ts`，在 `package.json` 中添加 script：
```json
"publish-packages": "node --experimental-strip-types scripts/publish.ts"
```

### 二进制文件名映射

SEA 构建产物与 npm 包之间的映射（`build-sea.ts` 的 `outputName` 与 npm 包名不完全一致）：

| SEA 构建产物 (`dist/bin/`) | npm 包 | 复制目标 |
|---|---|---|
| `media-summ-linux-x64` | `media-summ-linux-x64` | `bin/media-summ` |
| `media-summ-darwin-arm64` | `media-summ-darwin-arm64` | `bin/media-summ` |
| `media-summ-win-x64.exe` | `media-summ-win32-x64` | `bin/media-summ.exe` |

注意 Windows 构建产物名为 `media-summ-win-x64.exe`（`win` 而非 `win32`），发布脚本需处理此映射。

### 执行流程

1. 从根 `package.json` 读取版本号
2. 发布前检查：确认 `dist/bin/` 下三个二进制都存在，否则报错
3. 同步版本到所有 4 个 `npm/*/package.json`（包括主包的 `optionalDependencies` 版本号）
4. 按映射表复制二进制到对应 `npm/*/bin/` 目录
5. `--dry-run` 模式：默认先执行 `npm publish --dry-run` 验证所有包，无错误后提示用户确认
6. 按顺序 `npm publish --access public`：先三个平台包，最后主包
7. 如果中途失败，输出已发布和未发布的包列表，提示手动处理

## 使用方式

### 构建与发布

```bash
pnpm build:sea -- --all           # 构建三平台 SEA 二进制（注意 -- 传参）
pnpm run publish-packages         # 同步版本 + 复制二进制 + npm publish
```

### 前置条件

- `npm login --scope=@enjoypi` 登录 npm
- npm 上需要先创建 `@enjoypi` organization（首次发布前）
- 全平台构建建议在 macOS 上执行（darwin 二进制需要 codesign，非 macOS 主机构建的 darwin 二进制未签名，macOS Gatekeeper 可能拦截）

### 用户安装

```bash
npm install -g @enjoypi/media-summ
media-summ download <url>
media-summ summarize <path>
```

## 版本管理

所有 4 个包的版本从根 `package.json` 的 `version` 字段读取，publish 脚本自动同步。发布时版本必须一致。

## 构建依赖

- Node 24（SEA 构建）
- esbuild（打包为单文件 CJS）
- 现有 `scripts/build-sea.ts` 无需修改

## 约束与限制

- darwin 二进制的 codesign 只在 macOS 主机上执行；在 Linux 上 `--all` 构建的 darwin 二进制未签名
- 发布中途失败可能导致部分平台包版本不一致，需手动 `npm unpublish` 或发布补丁版本修复

## 不做的事

- 不做 postinstall fallback 下载
- 不做 CI 自动发布（手动本地发布）
- 不做 darwin-x64 支持
- 不做 npm provenance 签名（后续可加）
