/**
 * @module adapters/coursera/html-course-fetcher
 * @description Coursera HTML 页面解析课程数据（API 失败时的备用方案）
 * @layer Adapters
 */

import * as cheerio from 'cheerio';
import type { CourseFetcher, HttpClient } from '../../usecases/ports.js';
import type { Course, Week, Lesson } from '../../usecases/types.js';
import type { CourseraConfig } from '../../entities/config.js';

interface NextDataModule {
  name: string;
  items?: Array<{
    name: string;
    id: string;
    typeName?: string;
    content?: { subtitles?: Record<string, string> };
  }>;
}

export interface HtmlCourseFetcherOptions {
  baseUrl: string;
  coursera: CourseraConfig;
}

export class CourseraHtmlCourseFetcher implements CourseFetcher {
  constructor(
    private httpClient: HttpClient,
    private options: HtmlCourseFetcherOptions,
  ) {}

  async fetchBySlug(slug: string): Promise<Course | null> {
    const { coursera } = this.options;
    const url = `${this.options.baseUrl}${coursera.course_path_prefix}${slug}`;
    const res = await this.httpClient.get(url);

    if (res.status === 401) {
      throw new Error('认证失败（Cookie 无效）');
    }
    if (res.status === 403) {
      throw new Error('无权访问（未 Enroll 或需要付费）');
    }
    if (res.status !== 200) return null;

    const $ = cheerio.load(res.body);
    const scriptEl = $(coursera.next_data_selector);
    if (!scriptEl.length) return null;

    let nextData: Record<string, unknown>;
    try {
      nextData = JSON.parse(scriptEl.text());
    } catch {
      return null;
    }

    const pageProps = (nextData as { props?: { pageProps?: Record<string, unknown> } })?.props?.pageProps;
    if (!pageProps) return null;

    const courseName = (pageProps.courseMetadata as { name?: string })?.name ?? slug;
    const modules = (pageProps.modules as NextDataModule[]) ?? [];

    const weeks: Week[] = modules.map((mod, idx) => {
      const lessons: Lesson[] = (mod.items ?? [])
        .filter((item) => item.typeName === coursera.lecture_type_name || item.content?.subtitles)
        .map((item, lessonIdx) => ({
          title: item.name,
          videoId: item.id,
          subtitles: item.content?.subtitles
            ? Object.entries(item.content.subtitles).map(([lang, subtitleUrl]) => ({
                lang,
                format: subtitleUrl.endsWith(coursera.vtt_extension) ? coursera.format_vtt : coursera.format_srt,
                url: subtitleUrl,
              }))
            : [],
          index: lessonIdx + 1,
        }));
      return { number: idx + 1, title: mod.name, lessons };
    });

    if (weeks.length === 0) {
      weeks.push({ number: coursera.default_week_number, title: coursera.default_week_title, lessons: [] });
    }

    return { slug, name: courseName, url, weeks };
  }

  async fetchName(slug: string): Promise<string | null> {
    const course = await this.fetchBySlug(slug);
    return course?.name ?? null;
  }
}
