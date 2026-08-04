import { describe, it, expect } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, mergeConfig, userConfigPath } from '../../src/frameworks/config-loader.js';

function scratchConfig(body: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'media-summ-config-')), 'config.yaml');
  writeFileSync(path, body);
  return path;
}

describe('userConfigPath', () => {
  it('should honour XDG_CONFIG_HOME', () => {
    expect(userConfigPath({ XDG_CONFIG_HOME: '/xdg' }, '/home/dev')).toBe(
      '/xdg/media-summ/config.yaml',
    );
  });

  it('should fall back to ~/.config when XDG_CONFIG_HOME is unset', () => {
    expect(userConfigPath({}, '/home/dev')).toBe('/home/dev/.config/media-summ/config.yaml');
  });

  it('should fall back to ~/.config when XDG_CONFIG_HOME is empty', () => {
    expect(userConfigPath({ XDG_CONFIG_HOME: '' }, '/home/dev')).toBe(
      '/home/dev/.config/media-summ/config.yaml',
    );
  });

  it('should never put the config directly under the home directory', () => {
    expect(userConfigPath({}, '/home/dev')).not.toBe('/home/dev/.media-summ/config.yaml');
  });
});

describe('mergeConfig', () => {
  it('should keep base keys the override never mentions', () => {
    expect(mergeConfig({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it('should merge nested objects instead of replacing them', () => {
    expect(mergeConfig({ llm: { model: 'a', timeout: 1 } }, { llm: { model: 'b' } })).toEqual({
      llm: { model: 'b', timeout: 1 },
    });
  });

  it('should replace arrays wholesale', () => {
    expect(mergeConfig({ env_vars: ['A', 'B'] }, { env_vars: ['C'] })).toEqual({
      env_vars: ['C'],
    });
  });
});

describe('loadConfig', () => {
  it('should throw when an explicit path does not exist', () => {
    expect(() => loadConfig('/nonexistent/config.yaml')).toThrow('配置文件不存在');
  });

  it('should fill every missing key from the embedded defaults', () => {
    const config = loadConfig(scratchConfig('concurrency: 9\n'));
    expect(config.concurrency).toBe(9);
    expect(config.llm.model.length).toBeGreaterThan(0);
    expect(config.exit_codes.general_error).toBe(1);
  });

  it('should merge a partial nested override over the defaults', () => {
    const config = loadConfig(scratchConfig('llm:\n  model: custom-model\n'));
    expect(config.llm.model).toBe('custom-model');
    expect(config.llm.timeout).toBeGreaterThan(0);
  });

  it('should accept an empty override file', () => {
    expect(loadConfig(scratchConfig('')).concurrency).toBeGreaterThan(0);
  });
});
