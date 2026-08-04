/**
 * @module usecases/types
 * @description 实体类型重导出 — 为外层提供统一的类型入口
 * @layer Use Cases
 */

export type { Course, Week, Lesson, SubtitleMeta } from '../entities/course.js';
export type {
  ScannedCourse,
  SubCourse,
  ScannedWeek,
  ScannedLesson,
} from '../entities/course-scan.js';
export type { AppConfig, LlmConfig } from '../entities/config.js';
export { DownloadStatus } from '../entities/download-result.js';
export type { DownloadResult } from '../entities/download-result.js';
