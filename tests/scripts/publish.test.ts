import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 放到系统临时目录：测试文件已移入 tests/，用 import.meta.dirname 会在仓库里留目录。
const FIXTURES = join(tmpdir(), 'media-summ-publish-fixtures');

describe('publish script', () => {
  beforeEach(() => {
    mkdirSync(FIXTURES, { recursive: true });
  });

  afterEach(() => {
    rmSync(FIXTURES, { recursive: true, force: true });
  });

  describe('PLATFORM_MAP', () => {
    it('maps compiled binary names to npm package directories', async () => {
      const { PLATFORM_MAP } = await import('../../scripts/publish.ts');
      expect(PLATFORM_MAP).toEqual([
        {
          binaryOutput: 'media-summ-linux-x64',
          npmDir: 'media-summ-linux-x64',
          binName: 'media-summ',
        },
        {
          binaryOutput: 'media-summ-darwin-arm64',
          npmDir: 'media-summ-darwin-arm64',
          binName: 'media-summ',
        },
        {
          binaryOutput: 'media-summ-win32-x64.exe',
          npmDir: 'media-summ-win32-x64',
          binName: 'media-summ.exe',
        },
      ]);
    });
  });

  describe('syncVersions', () => {
    it('writes version to all npm package.json files', async () => {
      const { syncVersions } = await import('../../scripts/publish.ts');

      const npmDir = join(FIXTURES, 'npm');
      const pkgDir = join(npmDir, 'test-pkg');
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({ name: '@test/pkg', version: '0.0.0' }),
      );

      syncVersions('1.2.3', npmDir, [{ npmDir: 'test-pkg' }]);

      const result = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
      expect(result.version).toBe('1.2.3');
    });

    it('updates optionalDependencies versions in main package', async () => {
      const { syncVersions } = await import('../../scripts/publish.ts');

      const npmDir = join(FIXTURES, 'npm');
      const mainDir = join(npmDir, 'media-summ');
      mkdirSync(mainDir, { recursive: true });
      writeFileSync(
        join(mainDir, 'package.json'),
        JSON.stringify({
          name: '@enjoypi/media-summ',
          version: '0.0.0',
          optionalDependencies: {
            '@enjoypi/media-summ-linux-x64': '0.0.0',
          },
        }),
      );

      syncVersions('2.0.0', npmDir, [{ npmDir: 'media-summ' }]);

      const result = JSON.parse(readFileSync(join(mainDir, 'package.json'), 'utf-8'));
      expect(result.version).toBe('2.0.0');
      expect(result.optionalDependencies['@enjoypi/media-summ-linux-x64']).toBe('2.0.0');
    });
  });
});
