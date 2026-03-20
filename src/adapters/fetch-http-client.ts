/**
 * @module adapters/fetch-http-client
 * @description 基于 fetch 的 HTTP 客户端实现
 * @layer Adapters
 */

import type { HttpClient } from '../usecases/ports.js';

/** 秒转毫秒的转换因子 */
const MS_PER_SECOND = 1000;

interface FetchHttpClientOptions {
  timeout: number;
  userAgent: string;
  cookieJar?: {
    getCookieString(url: string): Promise<string>;
  };
}

export class FetchHttpClient implements HttpClient {
  constructor(private options: FetchHttpClientOptions) {}

  async get(url: string): Promise<{ status: number; body: string }> {
    const headers: Record<string, string> = { 'User-Agent': this.options.userAgent };

    if (this.options.cookieJar) {
      const cookieStr = await this.options.cookieJar.getCookieString(url);
      if (cookieStr) headers['Cookie'] = cookieStr;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeout * MS_PER_SECOND);

    try {
      const res = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
      const body = await res.text();
      return { status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  }
}
