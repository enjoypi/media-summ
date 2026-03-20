# Claude Code Project Context

## Architecture
- Clean Architecture 四层：entities → usecases → adapters → frameworks
- **无 lib/ 目录** - 按功能分到四层：领域工具→entities，配置加载→frameworks

## Key Patterns
- Container 使用懒加载 getter（如 `getSummarizeUseCase()`），避免强制初始化未使用的依赖
- `types.ts` 重新导出实体类型：`export { Foo } from '../entities/foo.js'`，不重复定义
- `ports.ts` 只定义 Port 接口，不含实体类型重导出
- TypeScript ESM 模块，构建输出到 `dist/`
- Adapter 接收外部配置通过 options 对象（如 `{ baseUrl: config.base_url }`）
- 只 export 被其他文件引用的符号；内部 Options/Input 接口不 export
- `sanitize` 必须处理所有特殊字符：`&@#$%^(){}[];',.!~\` 等

## Runtime
- `download` 子命令：**不需要** LLM API key；`cookies.txt` 可选（部分公开课程无需认证）
- `summarize` 子命令：需要配置 `llm.api_key`
- `summarize` 自动分块：估算 token 数超过 `llm.context_window` 时按 Week 分块总结后合并
- 字幕下载到 `./subtitles/<website-domain>/<specialization>/<course>/`（域名不含 `www.` 前缀，如 `coursera.org` 而非 `www.coursera.org`）

## Environment
- `LLM_API_KEY` - LLM API 密钥（summarize 子命令必需）
- `LLM_BASE_URL` - 可选，自定义 LLM endpoint
- `LLM_MODEL` - 可选，覆盖默认模型
- `HTTPS_PROXY` - 可选，代理设置

## Commands
- `pnpm build` - 编译 TypeScript
- `pnpm build:sea -- --all` - 构建所有平台 SEA 二进制
- `pnpm publish-packages` - 发布到 npm（含 dry-run 验证）
- `pnpm publish-packages --yes` - 跳过 dry-run 直接发布
- 修改 zod schema 后需 `rm -rf dist && pnpm build`，旧 dist 产物会导致 config 测试失败
- `pnpm start` - 运行 CLI（等效于 `node dist/frameworks/index.js`）
- `pnpm start download <url>` - 下载字幕（推荐用法）
- `pnpm start summarize <path>` - 总结课程（推荐用法）
- `pnpm test` - vitest（测试在 `src/**/*.test.ts`）
- `pnpm lint` - 类型检查（不输出 JS）

## Configuration
- 本地配置：`./config.yaml`
- 全局配置：`~/.media-summ/config.yaml`
- 可配置项：`base_url`, `empty_subtitle_placeholder`, `rate_limit.*`, `llm.*`, `summarize.*`, `coursera.api_endpoints.*`, `coursera.api_linked_keys.*`
- 流控配置：`rate_limit.default_concurrency`, `rate_limit.domain_concurrency`, `rate_limit.default_requests_per_minute`, `rate_limit.domain_requests_per_minute`

## Prerequisites
- `cookies.txt` - Netscape 格式 Cookie 文件
  - Chrome 导出方法：安装 "Get cookies.txt LOCALLY" 扩展 → 访问 coursera.org → 点击扩展 → 复制 Netscape 格式内容保存为 cookies.txt

## Output Structure
字幕下载到 `./subtitles/<website-domain>/<course-name>/`，所有名称经过 sanitize 处理（小写、特殊字符转连字符）。
课程扫描器（`FsCourseScanner`）支持两种结构：Week 子目录（`Week 1/`）和平铺文件（从 `{week}-{index}-title.vtt` 前缀推断 week）。

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
- 检查未使用代码：`npx tsc --noEmit --noUnusedLocals --noUnusedParameters`
- 并发控制使用 `p-limit`（已在依赖中）

## Common Patterns
- Adapters 常注入 `logger` 但未使用，优化时需检查实际调用
- 测试文件与源码同目录：`src/**/*.test.ts`
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
