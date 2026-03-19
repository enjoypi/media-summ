/**
 * @module adapters/coursera/specialization-fetcher
 * @description Coursera API Specialization 数据获取器
 * @layer Adapters
 */

import type { SpecializationFetcher, HttpClient } from '../../usecases/ports.js';

interface SpecResponse {
  elements?: { name: string; courseIds: string[] }[];
}

interface CoursesResponse {
  elements?: { id: string; slug: string; name: string }[];
}

export interface SpecializationFetcherOptions {
  baseUrl: string;
  specializationSlugPattern: string;
}

export class CourseraSpecializationFetcher implements SpecializationFetcher {
  constructor(
    private httpClient: HttpClient,
    private options: SpecializationFetcherOptions,
  ) {}

  extractSlug(url: string): string | null {
    const match = url.match(new RegExp(this.options.specializationSlugPattern));
    return match ? match[1] : null;
  }

  async fetchBySlug(slug: string): Promise<{ name: string; courses: Array<{ index: number; slug: string; name: string }> } | null> {
    const specUrl = `${this.options.baseUrl}/api/onDemandSpecializations.v1?q=slug&slug=${slug}&fields=courseIds,name`;
    const specRes = await this.httpClient.get(specUrl);
    if (specRes.status !== 200) return null;

    let specData: SpecResponse;
    try {
      specData = JSON.parse(specRes.body);
    } catch {
      return null;
    }

    const spec = specData.elements?.[0];
    if (!spec?.courseIds?.length) return null;

    const coursesUrl = `${this.options.baseUrl}/api/courses.v1?ids=${spec.courseIds.join(',')}&fields=slug,name`;
    const coursesRes = await this.httpClient.get(coursesUrl);
    if (coursesRes.status !== 200) return null;

    let coursesData: CoursesResponse;
    try {
      coursesData = JSON.parse(coursesRes.body);
    } catch {
      return null;
    }

    const courseMap = new Map(
      (coursesData.elements ?? []).map((c) => [c.id, { slug: c.slug, name: c.name.trim() }]),
    );

    const courses = spec.courseIds
      .map((id, idx) => {
        const c = courseMap.get(id);
        return c ? { index: idx + 1, slug: c.slug, name: c.name } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return { name: spec.name.trim(), courses };
  }
}

