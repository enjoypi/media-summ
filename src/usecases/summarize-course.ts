/**
 * @module usecases/summarize-course
 * @description 课程总结用例
 * @layer Use Cases
 */

import type { SubCourse } from './types.js';
import type { LlmClient, Logger, FileSystem, VttParser } from './ports.js';
import { estimateTokens } from '../entities/token-estimator.js';

interface SummarizeCourseInput {
  subCourse: SubCourse;
  outputDir: string;
  systemPrompt: string;
  outputFilename: string;
  contextWindow: number;
  charsPerToken: number;
  mergePrompt: string;
}

export class SummarizeCourseUseCase {
  constructor(
    private llmClient: LlmClient,
    private vttParser: VttParser,
    private fileSystem: FileSystem,
    private logger: Logger,
  ) {}

  async execute(input: SummarizeCourseInput): Promise<string> {
    const outPath = this.resolveOutputPath(input);

    this.logger.info(`开始总结: ${input.subCourse.name}（${input.subCourse.weeks.length} 个 Week）`);

    const content = this.buildFullContent(input.subCourse);
    const tokens = estimateTokens(content, input.charsPerToken);
    this.logger.info(`字幕合并完成，估算 token 数: ${tokens}`);

    const summary = tokens <= input.contextWindow
      ? await this.summarizeSingle(input.systemPrompt, input.subCourse.name, content)
      : await this.summarizeChunked(input);

    const doc = `# ${input.subCourse.name}\n\n${summary}\n`;
    this.fileSystem.write(outPath, doc);

    this.logger.info(`总结已保存: ${outPath}`);
    return outPath;
  }

  private async summarizeSingle(systemPrompt: string, name: string, content: string): Promise<string> {
    this.logger.info('使用单次调用模式');
    return this.llmClient.complete(systemPrompt, `# ${name}\n\n${content}`);
  }

  private async summarizeChunked(input: SummarizeCourseInput): Promise<string> {
    const { subCourse, systemPrompt, charsPerToken, contextWindow, mergePrompt } = input;
    const weeks = subCourse.weeks;

    this.logger.info(`使用分块模式，共 ${weeks.length} 个 Week`);

    const chunkSummaries: string[] = [];
    for (const week of weeks) {
      const weekContent = this.buildWeekContent(week);
      const weekTokens = estimateTokens(weekContent, charsPerToken);
      this.logger.info(`Week ${week.number}: 估算 ${weekTokens} tokens`);

      if (weekTokens > contextWindow) {
        this.logger.warn(`Week ${week.number} 单独超出阈值，仍尝试发送`);
      }

      const chunkSummary = await this.llmClient.complete(
        systemPrompt,
        `# ${subCourse.name} - Week ${week.number}\n\n${weekContent}`,
      );
      chunkSummaries.push(`## Week ${week.number}\n\n${chunkSummary}`);
    }

    this.logger.info('所有分块总结完成，正在合并...');
    const combined = chunkSummaries.join('\n\n');
    return this.llmClient.complete(mergePrompt, combined);
  }

  private resolveOutputPath(input: SummarizeCourseInput): string {
    return `${input.outputDir || input.subCourse.path}/${input.outputFilename}`;
  }

  private buildFullContent(subCourse: SubCourse): string {
    return subCourse.weeks
      .map((week) => this.buildWeekContent(week))
      .join('\n\n');
  }

  private buildWeekContent(week: SubCourse['weeks'][number]): string {
    const lessons = week.lessons
      .map((l) => {
        const text = this.vttParser.parse(l.vttPath);
        return `### ${l.title}\n\n${text}`;
      })
      .join('\n\n');
    return `## Week ${week.number}\n\n${lessons}`;
  }
}
