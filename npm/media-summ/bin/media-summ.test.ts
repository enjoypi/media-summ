import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const WRAPPER_PATH = join(import.meta.dirname, 'media-summ');

describe('bin wrapper', () => {
  it('exits with error message on unsupported platform', () => {
    // wrapper 在测试环境中找不到平台包，应报错退出
    try {
      execFileSync('node', [WRAPPER_PATH], {
        env: { ...process.env },
        encoding: 'utf-8',
      });
      expect.unreachable('should have thrown');
    } catch (err: any) {
      expect(err.status).not.toBe(0);
      expect(err.stderr.toString()).toMatch(/media-summ/i);
    }
  });
});
