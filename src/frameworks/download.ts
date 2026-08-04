/**
 * @module frameworks/download
 * @description download 子命令 — 使用 Clean Architecture 依赖注入
 * @layer Frameworks
 */

import { join } from 'node:path';
import { Command } from 'commander';
import { createContainer } from './container.js';
import { DownloadStatus } from '../usecases/types.js';
import type { DownloadResult } from '../usecases/types.js';

function extractSiteName(url: string, stripPattern: string, defaultName: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(new RegExp(stripPattern), '') || defaultName;
  } catch {
    return defaultName;
  }
}

function hasAllFailed(results: DownloadResult[]): boolean {
  return results.length > 0 && results.every((r) => r.status === DownloadStatus.Failed);
}

function matchesPatterns(msg: string, patterns: string[]): boolean {
  return patterns.some((p) => msg.includes(p));
}

export function registerDownload(program: Command): void {
  program
    .command('download')
    .description('下载在线课程字幕（支持 Coursera、Udemy 等）')
    .argument('<url>', '课程或 Specialization URL')
    .option('-o, --output <dir>', '输出目录')
    .action(async (url: string, opts: { output?: string }) => {
      const container = createContainer();
      const config = container.config;
      if (opts.output) config.output_dir = opts.output;

      try {
        const siteName = extractSiteName(
          url,
          config.url_patterns.site_name_strip_www,
          config.url_patterns.site_name_default,
        );
        const baseOutputDir = join(config.output_dir, siteName);

        const extDownloader = container.externalDownloaders.find((d) => d.canHandle(url));
        if (extDownloader) {
          await extDownloader.download(url, baseOutputDir, { lang: config.preferred_lang });
          process.exit(config.exit_codes.success);
        }

        const specSlug = container.specializationFetcher.extractSlug(url);
        if (specSlug) {
          await handleSpecialization(specSlug, container, baseOutputDir);
        } else {
          const course = await container.parseCourseUseCase.execute({ courseUrl: url });
          const results = await container.downloadSubtitlesUseCase.execute({
            course,
            preferredLang: config.preferred_lang,
            fallbackLang: config.download.fallback_lang,
            outputDir: baseOutputDir,
            concurrency: config.concurrency,
          });
          process.exit(
            hasAllFailed(results) ? config.exit_codes.all_failed : config.exit_codes.success,
          );
        }
      } catch (err) {
        const error = err as Error;
        const msg = error.message;
        const errCfg = config.error_messages;

        if (matchesPatterns(msg, errCfg.auth_error_patterns)) {
          console.error(errCfg.auth_error_hint);
          process.exit(config.exit_codes.auth_error);
        }
        if (matchesPatterns(msg, errCfg.access_error_patterns)) {
          console.error(errCfg.access_error_hint);
          process.exit(config.exit_codes.auth_error);
        }
        console.error(msg);
        process.exit(config.exit_codes.general_error);
      }
    });
}

async function handleSpecialization(
  slug: string,
  container: ReturnType<typeof createContainer>,
  baseOutputDir: string,
): Promise<void> {
  const config = container.config;
  container.logger.info(`解析 Specialization: ${slug}`);

  const spec = await container.specializationFetcher.fetchBySlug(slug);
  if (!spec) throw new Error(`无法获取 Specialization 信息: ${slug}`);

  container.logger.info(`${spec.name} (${spec.courses.length} 门课程)`);
  let totalFailed = 0;

  for (const c of spec.courses) {
    const prefix = String(c.index).padStart(
      config.download.prefix_padding_width,
      config.path_builder.pad_char,
    );
    const safeSpecName = container.pathBuilder.sanitizeName(spec.name);
    const safeCourseName = container.pathBuilder.sanitizeName(c.name);
    const courseOutputDir = join(
      baseOutputDir,
      safeSpecName,
      `${prefix}${config.path_builder.separator}${safeCourseName}`,
    );
    container.logger.info(`\n[${c.index}/${spec.courses.length}] ${c.name}`);

    try {
      const course = await container.parseCourseUseCase.execute({
        courseUrl: `${config.base_url}${config.coursera.course_path_prefix}${c.slug}`,
      });
      const results = await container.downloadSubtitlesUseCase.execute({
        course,
        preferredLang: config.preferred_lang,
        fallbackLang: config.download.fallback_lang,
        outputDir: courseOutputDir,
        concurrency: config.concurrency,
      });
      if (hasAllFailed(results)) totalFailed++;
    } catch (err) {
      if (
        matchesPatterns((err as Error).message, [
          ...config.error_messages.auth_error_patterns,
          ...config.error_messages.access_error_patterns,
        ])
      ) {
        container.logger.error(`跳过 ${c.name}: 需要认证或付费`);
        totalFailed++;
      } else {
        throw err;
      }
    }
  }

  container.logger.info(
    `\nSpecialization 下载完成: ${spec.courses.length - totalFailed} 成功, ${totalFailed} 失败`,
  );
  process.exit(
    totalFailed === spec.courses.length ? config.exit_codes.all_failed : config.exit_codes.success,
  );
}
