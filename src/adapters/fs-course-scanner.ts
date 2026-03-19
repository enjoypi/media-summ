/**
 * @module adapters/fs-course-scanner
 * @description 文件系统课程扫描器
 * @layer Adapters
 */

import { readdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import type { CourseScanner, ScannedCourse, ScannedLesson, ScannedWeek, SubCourse } from '../usecases/ports.js';

export interface CourseScannerOptions {
  weekPattern: string;
  subCoursePattern: string;
  subtitleExtension: string;
}

export class FileSystemCourseScanner implements CourseScanner {
  private weekPatternRegex: RegExp;
  private subCoursePatternRegex: RegExp;
  private subtitleExtension: string;

  constructor(options: CourseScannerOptions) {
    this.weekPatternRegex = new RegExp(options.weekPattern, 'i');
    this.subCoursePatternRegex = new RegExp(options.subCoursePattern);
    this.subtitleExtension = options.subtitleExtension;
  }

  scan(coursePath: string): ScannedCourse {
    const name = basename(coursePath);

    if (this.isSpecialization(coursePath)) {
      const subCourses = this.scanSubCourses(coursePath);
      if (subCourses.length === 0) {
        throw new Error(`扫描失败: Specialization "${name}" 中未找到有效子课程`);
      }
      return { name, path: coursePath, type: 'specialization', subCourses };
    }

    let weeks = this.scanWeeks(coursePath);
    if (weeks.length === 0) {
      weeks = this.scanFlatFiles(coursePath);
    }
    if (weeks.length === 0) {
      throw new Error(`扫描失败: 课程 "${name}" 中未找到包含 VTT 文件的 Week 目录`);
    }
    return { name, path: coursePath, type: 'single', subCourses: [{ name, path: coursePath, weeks }] };
  }

  private isSpecialization(coursePath: string): boolean {
    const entries = readdirSync(coursePath);
    return entries.some((e) => this.subCoursePatternRegex.test(e) && statSync(join(coursePath, e)).isDirectory());
  }

  private scanSubCourses(specPath: string): SubCourse[] {
    return readdirSync(specPath)
      .filter((d) => this.subCoursePatternRegex.test(d) && statSync(join(specPath, d)).isDirectory())
      .sort()
      .map((d) => {
        const scPath = join(specPath, d);
        return { name: d, path: scPath, weeks: this.scanWeeks(scPath) };
      })
      .filter((sc) => sc.weeks.length > 0);
  }

  private scanWeeks(coursePath: string): ScannedWeek[] {
    return readdirSync(coursePath)
      .filter((d) => this.weekPatternRegex.test(d) && statSync(join(coursePath, d)).isDirectory())
      .map((d) => {
        const match = this.weekPatternRegex.exec(d);
        const num = match ? parseInt(match[1], 10) : 0;
        const wPath = join(coursePath, d);
        return { number: num, path: wPath, lessons: this.scanLessons(wPath) };
      })
      .filter((w) => w.lessons.length > 0)
      .sort((a, b) => a.number - b.number);
  }

  private scanFlatFiles(coursePath: string): ScannedWeek[] {
    const FLAT_FILE_PATTERN = /^(\d+)-\d+-.+/;
    const files = readdirSync(coursePath)
      .filter((f) => extname(f).toLowerCase() === this.subtitleExtension && !statSync(join(coursePath, f)).isDirectory())
      .sort();

    const weekMap = new Map<number, ScannedLesson[]>();
    for (const f of files) {
      const match = FLAT_FILE_PATTERN.exec(f);
      if (!match) continue;
      const weekNum = parseInt(match[1], 10);
      const lessons = weekMap.get(weekNum) ?? [];
      lessons.push({ title: basename(f, extname(f)), vttPath: join(coursePath, f) });
      weekMap.set(weekNum, lessons);
    }

    return Array.from(weekMap.entries())
      .map(([number, lessons]) => ({ number, path: coursePath, lessons }))
      .sort((a, b) => a.number - b.number);
  }

  private scanLessons(weekPath: string): ScannedLesson[] {
    return readdirSync(weekPath)
      .filter((f) => extname(f).toLowerCase() === this.subtitleExtension)
      .sort()
      .map((f) => ({ title: basename(f, extname(f)), vttPath: join(weekPath, f) }));
  }
}
