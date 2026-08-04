/**
 * @module adapters/exponential-retry
 * @description 指数退避重试策略
 * @layer Adapters
 */

import type { RetryPolicy, Logger } from '../usecases/ports.js';

interface ExponentialRetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  exponentialBase: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ExponentialRetryPolicy implements RetryPolicy {
  constructor(
    private options: ExponentialRetryOptions,
    private logger: Logger,
  ) {}

  async execute<T>(operation: () => Promise<T>, label: string): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err as Error;

        if (attempt === this.options.maxRetries) {
          break;
        }

        const delay = this.options.baseDelayMs * Math.pow(this.options.exponentialBase, attempt);
        this.logger.warn(
          `${label} 失败 (尝试 ${attempt + 1}/${this.options.maxRetries + 1})，${delay}ms 后重试: ${lastError.message}`,
        );
        await sleep(delay);
      }
    }

    throw lastError;
  }
}
