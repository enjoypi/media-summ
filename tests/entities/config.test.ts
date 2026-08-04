import { describe, it, expect } from 'bun:test';
import { parse } from 'yaml';
import { appConfigSchema } from '../../src/entities/config.js';
import { DEFAULT_CONFIG_TEXT } from '../../src/frameworks/embedded-default.js';

// 断言内嵌默认值而非 cwd 下的 config.yaml：后者是可选的用户覆盖，仓库里已不存在。
function defaults(): Record<string, unknown> {
  return parse(DEFAULT_CONFIG_TEXT) as Record<string, unknown>;
}

describe('appConfigSchema', () => {
  it('should validate the embedded default config successfully', () => {
    expect(appConfigSchema.safeParse(defaults()).success).toBe(true);
  });

  it('should reject empty object', () => {
    expect(appConfigSchema.safeParse({}).success).toBe(false);
  });

  it('should reject config missing nested section', () => {
    const parsed = defaults();
    delete parsed['llm'];
    expect(appConfigSchema.safeParse(parsed).success).toBe(false);
  });

  it('should reject config with wrong type', () => {
    const parsed = defaults();
    parsed['concurrency'] = 'not-a-number';
    expect(appConfigSchema.safeParse(parsed).success).toBe(false);
  });
});
