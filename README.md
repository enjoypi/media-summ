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

Create `config.yaml` in the current directory or `~/.media-summ/config.yaml`:

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

## License

ISC
