/**
 * @module frameworks/summarize
 * @description summarize 子命令 — 使用 Clean Architecture 依赖注入
 * @layer Frameworks
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Command } from 'commander';
import { createContainer } from './container.js';

export function registerSummarize(program: Command): void {
  program
    .command('summarize')
    .description('总结课程字幕内容，生成 Markdown 学习笔记')
    .argument('<course-paths...>', '课程目录路径（支持多个）')
    .option('-c, --config <path>', '配置文件路径')
    .option('-o, --output <dir>', '输出目录')
    .option('-f, --force', '覆盖已存在的总结文档', false)
    .action(async (coursePaths: string[], opts: { config?: string; output?: string; force?: boolean }) => {
      const container = createContainer(opts.config);
      const config = container.config;
      const failures: string[] = [];

      const { prompt: systemPrompt, output_filename: outputFilename,
        chars_per_token: charsPerToken, merge_prompt: mergePrompt } = config.summarize;
      const { context_window: contextWindow } = config.llm;

      for (const cp of coursePaths) {
        const absPath = resolve(cp);
        try {
          if (!existsSync(absPath)) {
            throw new Error(`目录不存在: ${absPath}`);
          }

          const course = container.courseScanner.scan(absPath);
          container.logger.info(`课程类型: ${course.type}，包含 ${course.subCourses.length} 个子课程`);

          for (const sc of course.subCourses) {
            const outDir = opts.output ? resolve(opts.output) : undefined;
            const summaryPath = resolve(outDir ?? sc.path, outputFilename);

            if (!opts.force && existsSync(summaryPath)) {
              container.logger.info(`跳过（已存在）: ${summaryPath}，使用 --force 覆盖`);
              continue;
            }

            await container.getSummarizeUseCase().execute({
              subCourse: sc,
              outputDir: outDir ?? sc.path,
              systemPrompt,
              outputFilename,
              contextWindow,
              charsPerToken,
              mergePrompt,
            });
          }
        } catch (err) {
          container.logger.error(`课程处理失败 [${absPath}]: ${(err as Error).message}`);
          failures.push(absPath);
        }
      }

      if (failures.length > 0) {
        container.logger.error(`\n${failures.length} 个课程处理失败:`);
        failures.forEach((f) => container.logger.error(`  - ${f}`));
        process.exit(1);
      }
      container.logger.info('全部完成');
    });
}
