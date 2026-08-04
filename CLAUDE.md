# Claude Code Project Context

## Architecture
- Clean Architecture 四层：entities → usecases → adapters → frameworks
- **无 lib/ 目录** - 按功能分到四层：领域工具→entities，配置加载→frameworks
- `bin/media-summ.ts` 是唯一入口（薄壳），组装逻辑在 `src/frameworks/main.ts`
- 测试全在 `tests/` 且镜像 `src/` 分层；`tests/scripts/`、`tests/npm/` 对应 src 外的脚本与 npm 包装器
- 无 tsc 转译步骤：bun 直接跑源码，`tsc` 仅 `--noEmit` 做类型检查；`dist/` 只存编译产物

## Key Patterns
- Container 使用懒加载 getter（如 `getSummarizeUseCase()`），避免强制初始化未使用的依赖
- `types.ts` 重新导出实体类型：`export { Foo } from '../entities/foo.js'`，不重复定义
- `ports.ts` 只定义 Port 接口，不含实体类型重导出
- TypeScript ESM 模块，构建输出到 `dist/`
- Adapter 接收外部配置通过 options 对象（如 `{ baseUrl: config.base_url }`）
- 只 export 被其他文件引用的符号；内部 Options/Input 接口不 export
- `sanitize` 必须处理所有特殊字符：`&@#$%^(){}[];',.!~\` 等
- 新平台通过 `ExternalDownloader` port 扩展（strategy 模式），在 `container.externalDownloaders` 注册，`download` 命令自动分派

## Runtime
- `download` 子命令：**不需要** LLM API key；`cookies.txt` 可选（部分公开课程无需认证）
- `download` 支持 YouTube URL（通过 yt-dlp），需系统安装 `yt-dlp`
- `summarize` 子命令：需要配置 `llm.api_key`
- `summarize` 自动分块：估算 token 数超过 `llm.context_window` 时按 Week 分块总结后合并
- 字幕下载到 `./subtitles/<website-domain>/<specialization>/<course>/`（域名不含 `www.` 前缀，如 `coursera.org` 而非 `www.coursera.org`）

## Environment
- `LLM_API_KEY` - LLM API 密钥（summarize 子命令必需）
- `LLM_BASE_URL` - 可选，自定义 LLM endpoint
- `LLM_MODEL` - 可选，覆盖默认模型
- `HTTPS_PROXY` - 可选，代理设置

## Commands
纯 Bun 工具链，MUST NOT 引入 node/npm/pnpm/yarn。构建与镜像由 node2bun 驱动
（`bun link` 过 node2bun 仓库后可用）。
- `bun run check` - fmt → lint → compile → test → cov 全链
- `bun start download <url>` / `bun start summarize <path>` - 从源码跑 CLI
- `bun run build` - 本机单文件可执行 → `dist/media-summ`
- `bun run build:all` - 全平台产物 → `dist/<binaryName>-<platform>`（windows 带 .exe）；
  publish.ts 只取其中 linux-x64 / darwin-arm64 / win32-x64 三个
- `bun run docker` - distroless 镜像 `media-summ:latest`（arm64 daemon 实测 181MB）
- `bun run publish-packages` - 发布到 npm（含 dry-run 验证）；`--yes` 跳过 dry-run

## Configuration
- 默认值：`config/default.yaml`，经 `with { type: 'text' }` 内嵌进产物
  （见 `src/frameworks/embedded-default.ts`），单文件可执行因此无需随身携带配置
- 查找顺序：`-c` 显式路径 → `./config.yaml` → `$XDG_CONFIG_HOME/media-summ/config.yaml`
  （缺省 `~/.config/media-summ/`）；都不存在时自动生成后者
- MUST NOT 用 `~/.media-summ` —— 不在 home 根目录留应用私有目录
- 用户配置是增量覆盖，deep merge 到内嵌默认值之上，只需写出要改的键
- **数组是整体替换而非合并** —— 改 `config/default.yaml` 里的数组（如 `proxy.env_vars`）时，
  已有用户配置里的同名数组会永久盖住新值
- 新增配置项 MUST 同时更新 `config/default.yaml` 与 `src/entities/config.ts` 的 zod schema
- 可配置项：`base_url`, `empty_subtitle_placeholder`, `rate_limit.*`, `llm.*`, `summarize.*`, `coursera.api_endpoints.*`, `coursera.api_linked_keys.*`, `youtube.*`
- 流控配置：`rate_limit.default_concurrency`, `rate_limit.domain_concurrency`, `rate_limit.default_requests_per_minute`, `rate_limit.domain_requests_per_minute`

## Prerequisites
- `cookies.txt` - Netscape 格式 Cookie 文件
  - Chrome 导出方法：安装 "Get cookies.txt LOCALLY" 扩展 → 访问 coursera.org → 点击扩展 → 复制 Netscape 格式内容保存为 cookies.txt

## Output Structure
字幕下载到 `./subtitles/<website-domain>/<course-name>/`，所有名称经过 sanitize 处理（小写、特殊字符转连字符）。
课程扫描器（`FsCourseScanner`）三级回退：Week 子目录（`Week 1/`）→ 平铺文件（从 `{week}-{index}-title.vtt` 前缀推断 week）→ 无结构文件（按 `preferredLang` 过滤后全归 Week 1）。

**单课程结构**：
```
subtitles/
└── coursera.org/
    └── neural-networks-and-deep-learning/
        ├── 01-01-welcome-to-the-course.srt
        ├── 01-02-introduction-to-deep-learning.srt
        └── 02-01-neural-networks-basics.srt
```

**Specialization 结构**：
```
subtitles/
└── coursera.org/
    └── deep-learning/
        ├── 01-neural-networks-and-deep-learning/
        │   └── neural-networks-and-deep-learning/
        │       ├── 01-01-welcome.vtt
        │       └── ...
        └── 05-sequence-models/
            └── sequence-models/
                └── 01-01-why-sequence-models.vtt
```
- **summarize Specialization**：不能直接传 specialization 根目录，需传各子课程内层路径（含 .vtt 文件的目录）

- **目录名**：`{sanitized-course-name}/` 或 `{sanitized-spec-name}/{index}-{sanitized-course-name}/`
- **文件名**：`{week}-{index}-{sanitized-lesson-title}.{format}`

## Code Quality
- 检查未使用代码：`bun x tsc --noEmit --noUnusedLocals --noUnusedParameters`
- 并发控制使用 `p-limit`（已在依赖中）

## Common Patterns
- Adapters 常注入 `logger` 但未使用，优化时需检查实际调用
- 测试镜像源码分层：`src/usecases/x.ts` → `tests/usecases/x.test.ts`；`bunfig.toml` 把测试根锁定在 `tests/`
- OpenAI SDK `stream` 参数必须用 `true as const` / `false as const` 分支，`boolean` 类型无法推断返回类型

## Publishing
- npm 包发布到 `@enjoypi` scope，需要有 write 权限的 token
- 平台二进制包在 `npm/` 目录，`bin/.gitignore` 排除二进制文件；必须保留 `bin/.npmignore`（空文件）否则 npm 会遵守 `.gitignore` 导致 tarball 不含二进制
- 发布顺序：3 个平台包先发，主包 `@enjoypi/media-summ` 最后发

## Dependencies
- HTTP: `undici` (ProxyAgent)
- Parsing: `cheerio`, `@plussub/srt-vtt-parser`
- CLI: `commander`
- Config: `yaml`, `.env` 文件
- Concurrency: `p-limit`
