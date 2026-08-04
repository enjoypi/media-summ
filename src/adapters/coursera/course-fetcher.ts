/**
 * @module adapters/coursera/course-fetcher
 * @description Coursera API 课程数据获取器
 * @layer Adapters
 */

import type { CourseFetcher, HttpClient } from '../../usecases/ports.js';
import type { Course, Week, Lesson } from '../../usecases/types.js';
import type { CourseraConfig } from '../../entities/config.js';

interface LinkedModule {
  id: string;
  name: string;
}
interface LinkedLesson {
  id: string;
  itemIds: string[];
  moduleId: string;
}
interface LinkedItem {
  id: string;
  name: string;
  contentSummary: { typeName: string };
}

interface MaterialsResponse {
  elements: { id: string; moduleIds?: string[] }[];
  linked?: Record<string, unknown[]>;
}

export interface CourseFetcherOptions {
  baseUrl: string;
  coursera: CourseraConfig;
}

export class CourseraCourseFetcher implements CourseFetcher {
  constructor(
    private httpClient: HttpClient,
    private options: CourseFetcherOptions,
  ) {}

  async fetchBySlug(slug: string): Promise<Course | null> {
    const { coursera } = this.options;
    const url =
      `${this.options.baseUrl}${coursera.api_endpoints.materials}?q=slug&slug=${slug}` +
      '&includes=modules,lessons,items' +
      '&fields=moduleIds,' +
      'onDemandCourseMaterialModules.v1(name,slug,lessonIds),' +
      'onDemandCourseMaterialLessons.v1(name,slug,itemIds,moduleId),' +
      'onDemandCourseMaterialItems.v2(name,slug,contentSummary,lessonId)';

    const res = await this.httpClient.get(url);
    if (res.status !== 200) return null;

    let data: MaterialsResponse;
    try {
      data = JSON.parse(res.body);
    } catch {
      return null;
    }

    if (!data.elements?.length) return null;

    const courseId = data.elements[0].id;
    const linked = data.linked ?? {};
    const modules = (linked[coursera.api_linked_keys.modules] ?? []) as LinkedModule[];
    const lessons = (linked[coursera.api_linked_keys.lessons] ?? []) as LinkedLesson[];
    const items = (linked[coursera.api_linked_keys.items] ?? []) as LinkedItem[];

    const itemMap = new Map(
      items
        .filter((i) => i.contentSummary?.typeName === coursera.lecture_type_name)
        .map((i) => [i.id, i]),
    );

    const weeks: Week[] = modules.map((mod, idx) => {
      const weekLessons: Lesson[] = [];
      for (const les of lessons.filter((l) => l.moduleId === mod.id)) {
        for (const itemId of les.itemIds) {
          const item = itemMap.get(itemId);
          if (item) {
            weekLessons.push({
              title: item.name,
              videoId: `${courseId}~${item.id}`,
              subtitles: [],
              index: weekLessons.length + 1,
            });
          }
        }
      }
      return { number: idx + 1, title: mod.name, lessons: weekLessons };
    });

    if (weeks.length === 0) {
      weeks.push({
        number: coursera.default_week_number,
        title: coursera.default_week_title,
        lessons: [],
      });
    }

    const courseName = await this.fetchName(slug);
    return {
      slug,
      name: courseName || slug,
      url: `${this.options.baseUrl}${coursera.course_path_prefix}${slug}`,
      weeks,
    };
  }

  async fetchName(slug: string): Promise<string | null> {
    const { coursera } = this.options;
    const url = `${this.options.baseUrl}${coursera.api_endpoints.courses}?q=slug&slug=${slug}&fields=name`;
    try {
      const res = await this.httpClient.get(url);
      if (res.status === 200) {
        const data = JSON.parse(res.body) as { elements?: { name?: string }[] };
        const name = data.elements?.[0]?.name?.trim();
        if (name) return name;
      }
    } catch {
      // fallback
    }
    return null;
  }
}
