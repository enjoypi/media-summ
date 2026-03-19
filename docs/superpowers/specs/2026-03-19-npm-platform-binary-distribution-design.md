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

## bin wrapper

`npm/media-summ/bin/media-summ` 是一个 JS 脚本：

1. 根据 `process.platform` + `process.arch` 拼出平台包名
2. `require.resolve` 找到对应平台包中的二进制路径
3. `child_process.execFileSync` 执行，透传 `process.argv.slice(2)` 和 `stdio: "inherit"`
4. 不支持的平台直接报错退出

不做 postinstall fallback，保持简单。如果 optionalDependencies 安装失败，报错提示重装。

## 发布脚本

新增 `scripts/publish.ts`，执行流程：

1. 从根 `package.json` 读取版本号
2. 同步版本到所有 4 个 `npm/*/package.json`（包括主包的 `optionalDependencies` 版本号）
3. 将 `dist/bin/media-summ-linux-x64` 复制到 `npm/media-summ-linux-x64/bin/media-summ`（类推其他平台，Windows 重命名为 `.exe`）
4. 按顺序 `npm publish --access public`：先三个平台包，最后主包
5. 发布前检查：确认 `dist/bin/` 下三个二进制都存在，否则报错

## 使用方式

### 构建与发布

```bash
pnpm build:sea --all              # 构建三平台 SEA 二进制
pnpm run publish-packages         # 同步版本 + 复制二进制 + npm publish
```

发布前需要 `npm login --scope=@enjoypi`。

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

## 不做的事

- 不做 postinstall fallback 下载
- 不做 CI 自动发布（手动本地发布）
- 不做 darwin-x64 支持
- 不做 npm provenance 签名（后续可加）
