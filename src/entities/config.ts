import { z } from 'zod';

export const llmSchema = z.object({
  base_url: z.string(),
  api_key: z.string(),
  model: z.string(),
  reasoning_effort: z.string(),
  max_completion_tokens: z.number(),
  context_window: z.number(),
  timeout: z.number(),
});

export const summarizeSchema = z.object({
  prompt: z.string(),
  output_filename: z.string(),
  chars_per_token: z.number(),
  merge_prompt: z.string(),
});

export const rateLimiterSchema = z.object({
  rpm_to_ms_multiplier: z.number(),
  min_delay_factor: z.number(),
  max_delay_factor: z.number(),
});

export const pathBuilderSchema = z.object({
  number_padding_width: z.number(),
  pad_char: z.string(),
  separator: z.string(),
  extension_separator: z.string(),
});

export const courseScannerSchema = z.object({
  week_pattern: z.string(),
  sub_course_pattern: z.string(),
  subtitle_extension: z.string(),
  flat_file_pattern: z.string(),
});

export const sanitizeSchema = z.object({
  invalid_chars_pattern: z.string(),
  whitespace_pattern: z.string(),
  multiple_dash_pattern: z.string(),
  leading_trailing_dash_pattern: z.string(),
  replacement_char: z.string(),
});

export const urlPatternsSchema = z.object({
  course_slug: z.string(),
  specialization_slug: z.string(),
  site_name_strip_www: z.string(),
  site_name_default: z.string(),
  url_detect_pattern: z.string(),
});

export const exitCodesSchema = z.object({
  success: z.number(),
  auth_error: z.number(),
  all_failed: z.number(),
  general_error: z.number(),
});

export const downloadSchema = z.object({
  prefix_padding_width: z.number(),
  fallback_lang: z.string(),
});

export const rateLimitSchema = z.object({
  default_requests_per_minute: z.number(),
  domain_requests_per_minute: z.record(z.string(), z.number()),
});

export const courseraSchema = z.object({
  course_path_prefix: z.string(),
  next_data_selector: z.string(),
  lecture_type_name: z.string(),
  default_week_number: z.number(),
  default_week_title: z.string(),
  vtt_extension: z.string(),
  format_vtt: z.string(),
  format_srt: z.string(),
});

export const retrySchema = z.object({
  exponential_base: z.number(),
});

export const proxySchema = z.object({
  env_vars: z.array(z.string()),
});

export const errorMessagesSchema = z.object({
  auth_error_patterns: z.array(z.string()),
  access_error_patterns: z.array(z.string()),
  auth_error_hint: z.string(),
  access_error_hint: z.string(),
});

export const appConfigSchema = z.object({
  output_dir: z.string(),
  cookies_file: z.string(),
  concurrency: z.number(),
  timeout: z.number(),
  retry_max: z.number(),
  preferred_lang: z.string(),
  max_filename_length: z.number(),
  retry_base_ms: z.number(),
  user_agent: z.string(),
  base_url: z.string(),
  empty_subtitle_placeholder: z.string(),
  rate_limit: rateLimitSchema,
  llm: llmSchema,
  summarize: summarizeSchema,
  rate_limiter: rateLimiterSchema,
  path_builder: pathBuilderSchema,
  course_scanner: courseScannerSchema,
  sanitize: sanitizeSchema,
  url_patterns: urlPatternsSchema,
  exit_codes: exitCodesSchema,
  download: downloadSchema,
  coursera: courseraSchema,
  retry: retrySchema,
  proxy: proxySchema,
  error_messages: errorMessagesSchema,
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export type LlmConfig = z.infer<typeof llmSchema>;
export type SummarizeConfig = z.infer<typeof summarizeSchema>;
export type RateLimiterConfig = z.infer<typeof rateLimiterSchema>;
export type PathBuilderConfig = z.infer<typeof pathBuilderSchema>;
export type CourseScannerConfig = z.infer<typeof courseScannerSchema>;
export type SanitizeConfig = z.infer<typeof sanitizeSchema>;
export type UrlPatternsConfig = z.infer<typeof urlPatternsSchema>;
export type ExitCodesConfig = z.infer<typeof exitCodesSchema>;
export type DownloadConfig = z.infer<typeof downloadSchema>;
export type RateLimitConfig = z.infer<typeof rateLimitSchema>;
export type CourseraConfig = z.infer<typeof courseraSchema>;
export type RetryConfig = z.infer<typeof retrySchema>;
export type ProxyConfig = z.infer<typeof proxySchema>;
export type ErrorMessagesConfig = z.infer<typeof errorMessagesSchema>;
