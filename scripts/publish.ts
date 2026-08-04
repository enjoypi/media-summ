import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..');
// node2bun build --all 把每个平台产物写成 dist/<binaryName>-<platform>（windows 带 .exe）
const DIST_BIN = join(ROOT, 'dist');
const NPM_DIR = join(ROOT, 'npm');

interface PlatformEntry {
  binaryOutput: string;
  npmDir: string;
  binName: string;
}

export const PLATFORM_MAP: PlatformEntry[] = [
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
];

const MAIN_PKG_DIR = 'media-summ';

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  return pkg.version;
}

export function syncVersions(
  version: string,
  npmRoot: string,
  packages: { npmDir: string }[],
): void {
  for (const pkg of packages) {
    const pkgJsonPath = join(npmRoot, pkg.npmDir, 'package.json');
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    pkgJson.version = version;

    if (pkgJson.optionalDependencies) {
      for (const dep of Object.keys(pkgJson.optionalDependencies)) {
        pkgJson.optionalDependencies[dep] = version;
      }
    }

    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
    console.log(`[version] ${pkg.npmDir} → ${version}`);
  }
}

function checkBinaries(): void {
  const missing: string[] = [];
  for (const entry of PLATFORM_MAP) {
    const binPath = join(DIST_BIN, entry.binaryOutput);
    if (!existsSync(binPath)) {
      missing.push(entry.binaryOutput);
    }
  }
  if (missing.length > 0) {
    console.error(`[error] missing binaries in dist/bin/:\n  ${missing.join('\n  ')}`);
    console.error(`\nRun: bun run build:all`);
    process.exit(1);
  }
}

function copyBinaries(): void {
  for (const entry of PLATFORM_MAP) {
    const src = join(DIST_BIN, entry.binaryOutput);
    const destDir = join(NPM_DIR, entry.npmDir, 'bin');
    mkdirSync(destDir, { recursive: true });
    const dest = join(destDir, entry.binName);
    copyFileSync(src, dest);
    console.log(`[copy] ${entry.binaryOutput} → npm/${entry.npmDir}/bin/${entry.binName}`);
  }
}

function publishPackages(dryRun: boolean): void {
  const flag = dryRun ? ' --dry-run' : '';
  const published: string[] = [];
  const failed: string[] = [];

  const order = [...PLATFORM_MAP.map((e) => e.npmDir), MAIN_PKG_DIR];

  for (const dir of order) {
    const cwd = join(NPM_DIR, dir);
    const cmd = `bun publish --access public${flag}`;
    console.log(`\n[publish] ${dir}: ${cmd}`);
    try {
      execSync(cmd, { cwd, stdio: 'inherit' });
      published.push(dir);
    } catch {
      failed.push(dir);
      console.error(`\n[error] failed to publish ${dir}`);
      if (!dryRun) {
        console.error(`[status] published: ${published.join(', ') || 'none'}`);
        console.error(`[status] failed: ${failed.join(', ')}`);
        console.error(
          `[status] remaining: ${order.slice(published.length + failed.length).join(', ') || 'none'}`,
        );
      }
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log('\n[dry-run] all packages validated successfully');
  } else {
    console.log('\n[done] all packages published successfully');
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipDryRun = args.includes('--yes');

  const version = readVersion();
  console.log(`[version] ${version}`);

  checkBinaries();

  const allPackages = [
    ...PLATFORM_MAP.map((e) => ({ npmDir: e.npmDir })),
    { npmDir: MAIN_PKG_DIR },
  ];
  syncVersions(version, NPM_DIR, allPackages);

  copyBinaries();

  if (dryRun) {
    publishPackages(true);
    return;
  }

  if (!skipDryRun) {
    console.log('\n[dry-run] validating packages...');
    publishPackages(true);
    console.log('\n[publish] proceeding with actual publish...');
  }

  publishPackages(false);
}

// only run when executed directly, not when imported by tests
if (process.argv[1] === import.meta.filename) {
  main();
}
