/**
 * @module adapters/path-builder
 * @description 文件路径构建器
 * @layer Adapters
 */

import { join } from 'node:path';
import type { PathBuilder } from '../usecases/ports.js';
import type { SanitizeConfig, PathBuilderConfig } from '../entities/config.js';
import { sanitize } from '../entities/sanitize.js';

export interface PathBuilderOptions {
  maxFilenameLength: number;
  pathBuilderConfig: PathBuilderConfig;
  sanitizeConfig: SanitizeConfig;
}

export class DefaultPathBuilder implements PathBuilder {
  constructor(private options: PathBuilderOptions) {}

  sanitizeName(name: string): string {
    return sanitize(name, this.options.maxFilenameLength, this.options.sanitizeConfig);
  }

  build(
    outputDir: string,
    courseName: string,
    weekNumber: number,
    lessonIndex: number,
    lessonTitle: string,
    format: string,
  ): string {
    const safeCourse = this.sanitizeName(courseName);
    const safeLesson = this.sanitizeName(lessonTitle);
    const { number_padding_width, pad_char, separator, extension_separator } =
      this.options.pathBuilderConfig;
    const filename = `${weekNumber.toString().padStart(number_padding_width, pad_char)}${separator}${lessonIndex.toString().padStart(number_padding_width, pad_char)}${separator}${safeLesson}${extension_separator}${format}`;
    return join(outputDir, safeCourse, filename);
  }
}
