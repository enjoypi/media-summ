/**
 * @module adapters/coursera/subtitle-source
 * @description Coursera API 字幕数据源
 * @layer Adapters
 */

import type { SubtitleMeta, SubtitleSource, HttpClient } from '../../usecases/ports.js';

interface VideoResponse {
  elements: unknown[];
  linked?: {
    'onDemandVideos.v1'?: {
      subtitles?: Record<string, string>;
      subtitlesVtt?: Record<string, string>;
    }[];
  };
}

export interface SubtitleSourceOptions {
  baseUrl: string;
  formatVtt: string;
  formatSrt: string;
}

export class CourseraSubtitleSource implements SubtitleSource {
  constructor(
    private httpClient: HttpClient,
    private options: SubtitleSourceOptions,
  ) {}

  async fetchForVideo(videoId: string): Promise<SubtitleMeta[]> {
    const url = `${this.options.baseUrl}/api/onDemandLectureVideos.v1/${videoId}?includes=video&fields=subtitles,subtitlesVtt`;
    const res = await this.httpClient.get(url);
    if (res.status !== 200) return [];

    let data: VideoResponse;
    try {
      data = JSON.parse(res.body);
    } catch {
      return [];
    }

    const video = data.linked?.['onDemandVideos.v1']?.[0];
    if (!video) return [];

    const vttSubs = video.subtitlesVtt ?? {};
    const srtSubs = video.subtitles ?? {};
    const result: SubtitleMeta[] = [];

    for (const lang of new Set([...Object.keys(srtSubs), ...Object.keys(vttSubs)])) {
      if (vttSubs[lang]) {
        result.push({ lang, format: this.options.formatVtt, url: this.toAbsoluteUrl(vttSubs[lang]) });
      } else if (srtSubs[lang]) {
        result.push({ lang, format: this.options.formatSrt, url: this.toAbsoluteUrl(srtSubs[lang]) });
      }
    }

    return result;
  }

  private toAbsoluteUrl(path: string): string {
    return path.startsWith('http') ? path : `${this.options.baseUrl}${path}`;
  }
}
