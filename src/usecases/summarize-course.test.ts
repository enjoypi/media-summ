import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SummarizeCourseUseCase } from './summarize-course.js';
import type { LlmClient, VttParser, FileSystem, Logger, SubCourse } from './ports.js';

function createMocks() {
  const llmClient: LlmClient = { complete: vi.fn().mockResolvedValue('summary text') };
  const vttParser: VttParser = { parse: vi.fn().mockReturnValue('parsed subtitle') };
  const fileSystem: FileSystem = {
    exists: vi.fn().mockReturnValue(false),
    write: vi.fn(),
    read: vi.fn().mockReturnValue(''),
  };
  const logger: Logger = {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  };
  return { llmClient, vttParser, fileSystem, logger };
}

function makeSubCourse(weekCount: number, lessonsPerWeek: number): SubCourse {
  return {
    name: 'Test Course',
    path: '/tmp/test',
    weeks: Array.from({ length: weekCount }, (_, wi) => ({
      number: wi + 1,
      path: `/tmp/test/week-${wi + 1}`,
      lessons: Array.from({ length: lessonsPerWeek }, (_, li) => ({
        title: `Lesson ${li + 1}`,
        vttPath: `/tmp/test/w${wi + 1}/l${li + 1}.vtt`,
      })),
    })),
  };
}

const baseInput = {
  outputDir: '/tmp/out',
  systemPrompt: 'summarize this',
  outputFilename: 'summary.md',
  contextWindow: 100000,
  charsPerToken: 3,
  mergePrompt: 'merge these summaries',
};

describe('SummarizeCourseUseCase', () => {
  let mocks: ReturnType<typeof createMocks>;
  let useCase: SummarizeCourseUseCase;

  beforeEach(() => {
    mocks = createMocks();
    useCase = new SummarizeCourseUseCase(
      mocks.llmClient, mocks.vttParser, mocks.fileSystem, mocks.logger,
    );
  });

  it('should use single call when tokens are within threshold', async () => {
    const subCourse = makeSubCourse(2, 1);
    await useCase.execute({ ...baseInput, subCourse });

    expect(mocks.llmClient.complete).toHaveBeenCalledTimes(1);
    expect(mocks.llmClient.complete).toHaveBeenCalledWith(
      'summarize this',
      expect.stringContaining('# Test Course'),
    );
    expect(mocks.fileSystem.write).toHaveBeenCalledWith(
      '/tmp/out/summary.md',
      expect.stringContaining('# Test Course'),
    );
  });

  it('should use chunked mode when tokens exceed threshold', async () => {
    const subCourse = makeSubCourse(3, 2);
    const completeMock = mocks.llmClient.complete as ReturnType<typeof vi.fn>;
    completeMock
      .mockResolvedValueOnce('week 1 summary')
      .mockResolvedValueOnce('week 2 summary')
      .mockResolvedValueOnce('week 3 summary')
      .mockResolvedValueOnce('merged summary');

    await useCase.execute({ ...baseInput, subCourse, contextWindow: 1 });

    // 3 week calls + 1 merge call = 4
    expect(mocks.llmClient.complete).toHaveBeenCalledTimes(4);
    expect(mocks.llmClient.complete).toHaveBeenLastCalledWith(
      'merge these summaries',
      expect.stringContaining('## Week 1'),
    );
  });

  it('should write output file with course name header', async () => {
    const subCourse = makeSubCourse(1, 1);
    const completeMock = mocks.llmClient.complete as ReturnType<typeof vi.fn>;
    completeMock.mockResolvedValue('the summary');

    await useCase.execute({ ...baseInput, subCourse });

    expect(mocks.fileSystem.write).toHaveBeenCalledWith(
      '/tmp/out/summary.md',
      '# Test Course\n\nthe summary\n',
    );
  });

  it('should warn when a single week exceeds threshold in chunked mode', async () => {
    const subCourse = makeSubCourse(2, 1);
    await useCase.execute({ ...baseInput, subCourse, contextWindow: 1 });

    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('单独超出阈值'),
    );
  });
});
