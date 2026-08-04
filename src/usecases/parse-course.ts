/**
 * @module usecases/parse-course
 * @description 解析课程用例 — 将 URL 转换为 Course 实体
 * @layer Use Cases
 *
 * 依赖规则：
 * - 只依赖 Ports 接口和 Entity
 * - 不直接依赖任何外部实现（http-client, logger 等）
 */

import type { Course } from './types.js';
import type { CourseFetcher, SubtitleSource, Logger, RetryPolicy } from './ports.js';

interface ParseCourseInput {
  courseUrl: string;
}

interface ParseCourseOptions {
  courseSlugPattern: string;
}

export class ParseCourseUseCase {
  constructor(
    private primaryFetcher: CourseFetcher,
    private fallbackFetcher: CourseFetcher | null,
    private subtitleSource: SubtitleSource,
    private retryPolicy: RetryPolicy,
    private logger: Logger,
    private options: ParseCourseOptions,
  ) {}

  async execute(input: ParseCourseInput): Promise<Course> {
    const slug = this.extractSlug(input.courseUrl);
    if (!slug) {
      throw new Error(`无效的课程 URL: ${input.courseUrl}`);
    }

    this.logger.info(`解析课程: ${slug}`);

    let course: Course | null = null;

    try {
      course = await this.retryPolicy.execute(
        () => this.primaryFetcher.fetchBySlug(slug),
        `获取课程 ${slug}`,
      );
    } catch (err) {
      this.logger.warn(`主要数据源获取失败: ${(err as Error).message}`);
    }

    if (!course && this.fallbackFetcher) {
      this.logger.info('尝试备用数据源');
      course = await this.retryPolicy.execute(
        () => this.fallbackFetcher!.fetchBySlug(slug),
        `备用获取课程 ${slug}`,
      );
    }

    if (!course) {
      throw new Error(`无法获取课程信息: ${slug}`);
    }

    await this.enrichSubtitles(course);
    this.logCourseInfo(course);

    return course;
  }

  private extractSlug(url: string): string | null {
    const match = url.match(new RegExp(this.options.courseSlugPattern));
    return match ? match[1] : null;
  }

  private async enrichSubtitles(course: Course): Promise<void> {
    for (const week of course.weeks) {
      for (const lesson of week.lessons) {
        if (lesson.subtitles.length === 0) {
          try {
            lesson.subtitles = await this.retryPolicy.execute(
              () => this.subtitleSource.fetchForVideo(lesson.videoId),
              `获取字幕 ${lesson.title}`,
            );
          } catch {
            this.logger.warn(`获取字幕信息失败: ${lesson.title}`);
          }
        }
      }
    }
  }

  private logCourseInfo(course: Course): void {
    const totalLessons = course.weeks.reduce((sum, w) => sum + w.lessons.length, 0);
    this.logger.info(
      `课程: ${course.name} (${course.weeks.length} weeks, ${totalLessons} lessons)`,
    );
  }
}
