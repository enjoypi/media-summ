import { describe, it, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// 测试已移出 npm/ 包内，路径改为从 tests/ 指回被测的 wrapper。
const WRAPPER_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'npm',
  'media-summ',
  'bin',
  'media-summ',
);

describe('bin wrapper', () => {
  it('exits with error message on unsupported platform', () => {
    // wrapper 在测试环境中找不到平台包，应报错退出。
    // 用当前运行时而非 node 启动：纯 Bun 工具链里没有 node，而 wrapper 是 CJS，
    // bun 能原样执行；发布后由装了 node 的 npm 用户按其 shebang 运行。
    try {
      execFileSync(process.execPath, [WRAPPER_PATH], {
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
