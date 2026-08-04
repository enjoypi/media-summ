import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { appConfigSchema, type AppConfig } from '../entities/config.js';
import type { Logger } from '../usecases/ports.js';
import { DEFAULT_CONFIG_TEXT } from './embedded-default.js';

const CONFIG_FILENAME = 'config.yaml';
const APP_DIR = 'media-summ';
const XDG_FALLBACK = '.config';

// XDG Base Directory：优先 $XDG_CONFIG_HOME，否则 ~/.config/media-summ/。
// MUST NOT 回到 ~/.media-summ —— 不在 home 根目录留应用私有目录。
export function userConfigPath(
  env: Record<string, string | undefined> = process.env,
  home: string = homedir(),
): string {
  const xdg = env['XDG_CONFIG_HOME'];
  const base = xdg && xdg.length > 0 ? xdg : join(home, XDG_FALLBACK);
  return join(base, APP_DIR, CONFIG_FILENAME);
}

function applyEnvOverrides(config: AppConfig): void {
  if (process.env['LLM_API_KEY']) config.llm.api_key = process.env['LLM_API_KEY'];
  if (process.env['LLM_BASE_URL']) config.llm.base_url = process.env['LLM_BASE_URL'];
  if (process.env['LLM_MODEL']) config.llm.model = process.env['LLM_MODEL'];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Array.isArray(value) === false;
}

// 数组是整体替换而非合并：改 config/default.yaml 里的数组时，用户配置中的
// 同名数组会永久盖住新值。
export function mergeConfig(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  return Object.entries(override).reduce<Record<string, unknown>>(
    (merged, [key, value]) => {
      const current = merged[key];
      if (isPlainObject(current) && isPlainObject(value)) {
        return { ...merged, [key]: mergeConfig(current, value) };
      }
      return { ...merged, [key]: value };
    },
    { ...base },
  );
}

function generateUserConfig(logger?: Logger): string {
  const target = userConfigPath();
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, DEFAULT_CONFIG_TEXT);
  logger?.info(`已生成默认配置: ${target}`);
  return target;
}

function resolvePath(explicitPath: string | undefined, logger?: Logger): string {
  if (explicitPath) {
    if (!existsSync(explicitPath)) throw new Error(`配置文件不存在: ${explicitPath}`);
    return explicitPath;
  }
  const found = [join(process.cwd(), CONFIG_FILENAME), userConfigPath()].find((path) =>
    existsSync(path),
  );
  if (found) return found;
  return generateUserConfig(logger);
}

// 内嵌默认值始终作为底座，用户文件只需写出要改的键；都不存在时在 XDG 目录下
// 生成一份完整默认配置，编译后的单文件可执行因此无需随身携带 config.yaml。
// .env 由 bun 自动加载，无需手写 dotenv 解析。
export function loadConfig(explicitPath?: string, logger?: Logger): AppConfig {
  const defaults = parse(DEFAULT_CONFIG_TEXT) as Record<string, unknown>;
  const path = resolvePath(explicitPath, logger);
  logger?.info(`加载配置: ${path}`);
  const override = (parse(readFileSync(path, 'utf-8')) ?? {}) as Record<string, unknown>;
  const config = appConfigSchema.parse(mergeConfig(defaults, override));
  applyEnvOverrides(config);
  return config;
}
