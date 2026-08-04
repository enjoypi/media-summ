# media-summ

Download online course subtitles and summarize them with LLM.

## Install

```bash
npm install -g @enjoypi/media-summ
```

Supported platforms: Linux x64, macOS ARM64, Windows x64.

## Usage

### Download subtitles

```bash
media-summ download <url>
```

Options:
- `-o, --output <dir>` — output directory (default: `./subtitles/`)

Requires a `cookies.txt` file (Netscape format) in the current directory. Export from Chrome using the "Get cookies.txt LOCALLY" extension.

### Summarize

```bash
media-summ summarize <course-paths...>
```

Options:
- `-c, --config <path>` — config file path
- `-o, --output <dir>` — output directory
- `-f, --force` — overwrite existing summaries

Supports multiple course paths. Long transcripts are automatically chunked by week and merged.

## Configuration

Defaults are compiled into the binary, so no config file is required to run. On
first launch a complete config is written to `$XDG_CONFIG_HOME/media-summ/config.yaml`
(`~/.config/media-summ/config.yaml` when `XDG_CONFIG_HOME` is unset) for you to edit.

Resolution order — the first file found wins, and its keys are merged over the
built-in defaults, so a config only needs to state what differs:

1. `-c, --config <path>`
2. `./config.yaml`
3. `$XDG_CONFIG_HOME/media-summ/config.yaml`

```yaml
output_dir: ./subtitles
cookies_file: ./cookies.txt
preferred_lang: en
concurrency: 3

llm:
  base_url: https://api.openai.com/v1
  api_key: ${LLM_API_KEY}
  model: gpt-4o
  context_window: 128000

rate_limit:
  default_concurrency: 5
  default_requests_per_minute: 60
```

### Environment variables

| Variable | Description |
|---|---|
| `LLM_API_KEY` | LLM API key (required for `summarize`) |
| `LLM_BASE_URL` | Custom LLM endpoint |
| `LLM_MODEL` | Override default model |
| `HTTPS_PROXY` | Proxy settings |

Bun loads `.env` from the working directory automatically, for both `bun run`
and the compiled binary.

## Development

Requires [Bun](https://bun.sh) only — no Node, npm or pnpm, and no transpile
step: Bun runs the TypeScript sources directly.

```bash
bun install
bun start download <url>   # run the CLI from source
bun run check              # fmt -> lint -> typecheck -> test -> coverage
```

Build and packaging are driven by [node2bun](https://github.com/enjoypi/node2bun);
run `bun link` in its repo once to put it on `PATH`.

```bash
bun run build              # single-file executable for this machine -> dist/media-summ
bun run build:all          # every platform -> dist/media-summ-<platform>
bun run docker             # distroless image -> media-summ:latest
bun run publish-packages   # sync versions, copy binaries, publish to npm
```

## License

ISC
