import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dirname, '__test_fixtures__');

describe('publish script', () => {
  beforeEach(() => {
    mkdirSync(FIXTURES, { recursive: true });
  });

  afterEach(() => {
    rmSync(FIXTURES, { recursive: true, force: true });
  });

  describe('PLATFORM_MAP', () => {
    it('maps SEA output names to npm package directories', async () => {
      const { PLATFORM_MAP } = await import('./publish.ts');
      expect(PLATFORM_MAP).toEqual([
        {
          seaOutput: 'media-summ-linux-x64',
          npmDir: 'media-summ-linux-x64',
          binName: 'media-summ',
        },
        {
          seaOutput: 'media-summ-darwin-arm64',
          npmDir: 'media-summ-darwin-arm64',
          binName: 'media-summ',
        },
        {
          seaOutput: 'media-summ-win-x64.exe',
          npmDir: 'media-summ-win32-x64',
          binName: 'media-summ.exe',
        },
      ]);
    });
  });

  describe('syncVersions', () => {
    it('writes version to all npm package.json files', async () => {
      const { syncVersions } = await import('./publish.ts');

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
      const { syncVersions } = await import('./publish.ts');

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
