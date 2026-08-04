/**
 * @module adapters/domain-rate-limiter
 * @description 基于域名的请求间隔限流器（根据 RPM 计算随机延迟）
 * @layer Adapters
 */

import type { Logger } from '../usecases/ports.js';

export interface DomainRateLimiterOptions {
  defaultRequestsPerMinute: number;
  domainRequestsPerMinute: Record<string, number>;
  rpmToMsMultiplier: number;
  minDelayFactor: number;
  maxDelayFactor: number;
  unknownDomain: string;
}

export class DomainRateLimiter {
  constructor(
    private options: DomainRateLimiterOptions,
    private logger: Logger,
  ) {}

  async acquire(url: string): Promise<() => void> {
    const domain = this.extractDomain(url);
    const rpm = this.getRequestsPerMinute(domain);

    await this.applyRandomDelay(rpm, domain);

    return () => this.release(domain);
  }

  private release(domain: string): void {
    this.logger.debug(`[${domain}] 请求完成`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async applyRandomDelay(rpm: number, domain: string): Promise<void> {
    const multiplier = this.options.rpmToMsMultiplier;
    const minFactor = this.options.minDelayFactor;
    const maxFactor = this.options.maxDelayFactor;
    const avgInterval = multiplier / rpm;
    const minDelay = avgInterval * minFactor;
    const maxDelay = avgInterval * maxFactor;
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    this.logger.debug(`[${domain}] 间隔 ${Math.round(delay)}ms (RPM: ${rpm})`);
    await this.sleep(delay);
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return this.options.unknownDomain;
    }
  }

  private getRequestsPerMinute(domain: string): number {
    return this.options.domainRequestsPerMinute?.[domain] ?? this.options.defaultRequestsPerMinute;
  }
}
