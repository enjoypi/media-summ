# TODO

## 1. 新增 `translate` 子命令（借鉴 old-sh/translate_vtt.py）

- 入口：仿 `src/frameworks/summarize.ts` 新增 `registerTranslate`，在 `src/frameworks/index.ts` 注册 `translate <path>`
- 用例：`src/usecases/translate-vtt.ts`，复用 `LlmClient` 端口（`src/usecases/ports.ts`）与 `createContainer` 注入
- 需新端口或扩展 `VttParser`：翻译需保留时间戳输出 VTT，现有 `LibVttParser.parse()` 只回纯文本，需新增返回 entries（含时间戳）的接口
- 借鉴的设计：
  1. 分块带重叠（每批约 50 个字幕块，前后重叠 10 块），缓解上下文断裂
  2. `[BLOCK_X]` 标记包裹每个字幕块，prompt 强制块一一对应、禁止合并/拆分，翻译后按标记回取并校验块数一致
  3. 翻译验证器：时间戳逐一比对源文件、时间戳格式/顺序校验、空翻译/未翻译/超长行/HTML 标签检查
  4. 断点续翻：输出已存在且验证通过则跳过；先写 `.tmp` 验证通过再原子改名
  5. 失败即停，避免烧 token 产生半成品
- 配置：`entities/config.ts` 新增 `translate:` 节（目标语言、prompt、每批块数、重叠块数），config.yaml 补默认值；输出文件名 `.en.vtt` → `.zh-Hans.vtt`
- 约束：单一职责拆分模块（解析/分块/翻译/验证/合并），文件 < 512 行、函数 < 64 行、测试先行

## 2. 修复 VTT 解析清洗（LibVttParser）

- `src/adapters/vtt-parser-adapter.ts`：增加滚动字幕重复行去重、HTML/ASS 标签（如 `<c>`, `<i>`, `{\an8}`）清洗
- 惠及 `summarize`（减少 token 浪费）与未来的 `translate`
- 先补失败测试（构造含重复行和标签的 VTT fixture）

## 3. 新增 `mindmap` 子命令（借鉴 old-sh/vtt_to_mindmap.py）

- 扫描课程目录 VTT → 纯文本（复用修复后的 `VttParser`）→ LLM 生成思维导图代码写入 `mindmap.puml` / `mindmap.mmd`
- 输出格式（PlantUML / Mermaid）与 prompt 走 config.yaml 新配置节
- 复用 `LlmClient`、`FsCourseScanner`、`createContainer`
