/**
 * @module usecases/download-subtitles
 * @description 下载字幕用例
 * @layer Use Cases
 */

import pLimit from 'p-limit';
import type { Course, SubtitleMeta, DownloadResult } from './types.js';
import { DownloadStatus } from './types.js';
import type { Logger, RetryPolicy, FileSystem, PathBuilder, HttpClient } from './ports.js';

interface DownloadSubtitlesInput {
  course: Course;
  preferredLang: string;
  fallbackLang: string;
  outputDir: string;
  concurrency: number;
}

interface DownloadTask {
  weekNumber: number;
  lessonIndex: number;
  lessonTitle: string;
  subtitleUrl: string;
  format: string;
  index: number;
  total: number;
}

interface RateLimiter {
  acquire(url: string): Promise<() => void>;
}

export class DownloadSubtitlesUseCase {
  constructor(
    private httpClient: HttpClient,
    private fileSystem: FileSystem,
    private pathBuilder: PathBuilder,
    private retryPolicy: RetryPolicy,
    private rateLimiter: RateLimiter,
    private logger: Logger,
  ) {}

  async execute(input: DownloadSubtitlesInput): Promise<DownloadResult[]> {
    const tasks = this.buildTasks(input.course, input.preferredLang, input.fallbackLang);

    if (tasks.length === 0) {
      this.logger.warn('未找到符合条件的字幕');
      return [];
    }

    const limit = pLimit(input.concurrency);
    const results = await Promise.all(
      tasks.map((task) => limit(() => this.downloadOne(task, input))),
    );

    const counts = results.reduce(
      (acc, r) => {
        if (r.status === DownloadStatus.Success) acc.success++;
        else if (r.status === DownloadStatus.Skipped) acc.skipped++;
        else acc.failed++;
        return acc;
      },
      { success: 0, skipped: 0, failed: 0 },
    );

    this.logger.info(`完成: ${counts.success} 成功, ${counts.skipped} 跳过, ${counts.failed} 失败`);
    return results;
  }

  private buildTasks(course: Course, preferredLang: string, fallbackLang: string): DownloadTask[] {
    const tasks: DownloadTask[] = [];

    for (const week of course.weeks) {
      for (const lesson of week.lessons) {
        const sub = this.pickSubtitle(lesson.subtitles, preferredLang, fallbackLang);
        if (sub) {
          tasks.push({
            weekNumber: week.number,
            lessonIndex: lesson.index,
            lessonTitle: lesson.title,
            subtitleUrl: sub.url,
            format: sub.format,
            index: tasks.length + 1,
            total: 0,
          });
        }
      }
    }

    for (const t of tasks) t.total = tasks.length;
    return tasks;
  }

  private pickSubtitle(
    subtitles: SubtitleMeta[],
    preferredLang: string,
    fallbackLang: string,
  ): Pick<SubtitleMeta, 'format' | 'url'> | null {
    return (
      subtitles.find((s) => s.lang === preferredLang) ??
      subtitles.find((s) => s.lang.startsWith(fallbackLang)) ??
      null
    );
  }

  private async downloadOne(
    task: DownloadTask,
    input: DownloadSubtitlesInput,
  ): Promise<DownloadResult> {
    const filePath = this.pathBuilder.build(
      input.outputDir,
      input.course.name,
      task.weekNumber,
      task.lessonIndex,
      task.lessonTitle,
      task.format,
    );

    const label = `[${task.index}/${task.total}] Week ${task.weekNumber} / ${task.lessonTitle}.${task.format}`;

    if (this.fileSystem.exists(filePath)) {
      this.logger.info(`${label} ... skipped (已存在)`);
      return {
        lesson: task.lessonTitle,
        status: DownloadStatus.Skipped,
        reason: '已存在',
        filePath,
      };
    }

    // 获取域名限流锁
    const release = await this.rateLimiter.acquire(task.subtitleUrl);

    try {
      const content = await this.retryPolicy.execute(async () => {
        const res = await this.httpClient.get(task.subtitleUrl);
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        return res.body;
      }, label);

      this.fileSystem.write(filePath, content);
      this.logger.info(`${label} ... done`);
      return { lesson: task.lessonTitle, status: DownloadStatus.Success, filePath };
    } catch (err) {
      this.logger.error(`${label} ... failed (${(err as Error).message})`);
      return {
        lesson: task.lessonTitle,
        status: DownloadStatus.Failed,
        reason: (err as Error).message,
      };
    } finally {
      release();
    }
  }
}
