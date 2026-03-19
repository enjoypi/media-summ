/**
 * @module frameworks/container
 * @description 依赖注入容器 — 在 Frameworks 层组装所有依赖
 * @layer Frameworks
 *
 * 这是唯一知道所有具体实现的地方，负责将 Adapter 注入到 Use Case
 */

import type { AppConfig } from '../usecases/ports.js';
import { ParseCourseUseCase } from '../usecases/parse-course.js';
import { DownloadSubtitlesUseCase } from '../usecases/download-subtitles.js';
import { SummarizeCourseUseCase } from '../usecases/summarize-course.js';
import { FetchHttpClient } from '../adapters/fetch-http-client.js';
import { ConsoleLogger } from '../adapters/console-logger.js';
import { CourseraCourseFetcher } from '../adapters/coursera/course-fetcher.js';
import { CourseraSubtitleSource } from '../adapters/coursera/subtitle-source.js';
import { ExponentialRetryPolicy } from '../adapters/exponential-retry.js';
import { NodeFileSystem } from '../adapters/node-file-system.js';
import { DefaultPathBuilder } from '../adapters/path-builder.js';
import { FileSystemCourseScanner } from '../adapters/fs-course-scanner.js';
import { LibVttParser } from '../adapters/vtt-parser-adapter.js';
import { OpenAiLlmClient } from '../adapters/openai-llm-client.js';
import { CourseraHtmlCourseFetcher } from '../adapters/coursera/html-course-fetcher.js';
import { CourseraSpecializationFetcher } from '../adapters/coursera/specialization-fetcher.js';
import { DomainRateLimiter } from '../adapters/domain-rate-limiter.js';
import { loadConfig } from './config-loader.js';
import { loadCookies } from '../adapters/cookie-loader.js';

export interface Container {
  parseCourseUseCase: ParseCourseUseCase;
  downloadSubtitlesUseCase: DownloadSubtitlesUseCase;
  courseScanner: FileSystemCourseScanner;
  specializationFetcher: CourseraSpecializationFetcher;
  httpClient: FetchHttpClient;
  config: AppConfig;
  logger: ConsoleLogger;
  getSummarizeUseCase(): SummarizeCourseUseCase;
}

export function createContainer(explicitConfigPath?: string): Container {
  const logger = new ConsoleLogger();
  const config = loadConfig(explicitConfigPath, logger);

  const cookieJar = loadCookies(config.cookies_file, logger);
  const httpClient = new FetchHttpClient({
    timeout: config.timeout,
    userAgent: config.user_agent,
    cookieJar: cookieJar || undefined,
  });

  const retryPolicy = new ExponentialRetryPolicy(
    {
      maxRetries: config.retry_max,
      baseDelayMs: config.retry_base_ms,
      exponentialBase: config.retry.exponential_base,
    },
    logger,
  );

  const rateLimiter = new DomainRateLimiter(
    {
      defaultRequestsPerMinute: config.rate_limit.default_requests_per_minute,
      domainRequestsPerMinute: config.rate_limit.domain_requests_per_minute,
      rpmToMsMultiplier: config.rate_limiter.rpm_to_ms_multiplier,
      minDelayFactor: config.rate_limiter.min_delay_factor,
      maxDelayFactor: config.rate_limiter.max_delay_factor,
      unknownDomain: config.url_patterns.site_name_default,
    },
    logger,
  );

  const courseraOpts = { baseUrl: config.base_url, coursera: config.coursera };
  const courseFetcher = new CourseraCourseFetcher(httpClient, courseraOpts);
  const subtitleSource = new CourseraSubtitleSource(httpClient, {
    baseUrl: config.base_url,
    formatVtt: config.coursera.format_vtt,
    formatSrt: config.coursera.format_srt,
  });
  const fileSystem = new NodeFileSystem();
  const pathBuilder = new DefaultPathBuilder({
    maxFilenameLength: config.max_filename_length,
    pathBuilderConfig: config.path_builder,
    sanitizeConfig: config.sanitize,
  });
  const courseScanner = new FileSystemCourseScanner({
    weekPattern: config.course_scanner.week_pattern,
    subCoursePattern: config.course_scanner.sub_course_pattern,
    subtitleExtension: config.course_scanner.subtitle_extension,
    flatFilePattern: config.course_scanner.flat_file_pattern,
  });
  const vttParser = new LibVttParser({ emptyPlaceholder: config.empty_subtitle_placeholder });
  const specializationFetcher = new CourseraSpecializationFetcher(httpClient, { baseUrl: config.base_url, specializationSlugPattern: config.url_patterns.specialization_slug });

  const htmlCourseFetcher = new CourseraHtmlCourseFetcher(httpClient, courseraOpts);
  const parseCourseUseCase = new ParseCourseUseCase(
    courseFetcher,
    htmlCourseFetcher,
    subtitleSource,
    retryPolicy,
    logger,
    { courseSlugPattern: config.url_patterns.course_slug },
  );

  const downloadSubtitlesUseCase = new DownloadSubtitlesUseCase(
    httpClient,
    fileSystem,
    pathBuilder,
    retryPolicy,
    rateLimiter,
    logger,
  );

  const getSummarizeUseCase = (): SummarizeCourseUseCase => {
    const llmClient = new OpenAiLlmClient({
      config: config.llm,
      proxyEnvVars: config.proxy.env_vars,
    });
    return new SummarizeCourseUseCase(llmClient, vttParser, fileSystem, logger);
  };

  return {
    parseCourseUseCase,
    downloadSubtitlesUseCase,
    courseScanner,
    specializationFetcher,
    httpClient,
    config,
    logger,
    getSummarizeUseCase,
  };
}
