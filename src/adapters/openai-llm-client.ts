/**
 * @module adapters/openai-llm-client
 * @description OpenAI 兼容 LLM 客户端
 * @layer Adapters
 */

import OpenAI from 'openai';
import { ProxyAgent } from 'undici';
import type { LlmClient } from '../usecases/ports.js';
import type { LlmConfig } from '../usecases/types.js';

interface OpenAiLlmClientOptions {
  config: LlmConfig;
  proxyEnvVars: string[];
}

export class OpenAiLlmClient implements LlmClient {
  private client: OpenAI;
  private config: LlmConfig;

  constructor(options: OpenAiLlmClientOptions) {
    this.config = options.config;
    if (!this.config.api_key) throw new Error('LLM 配置错误: api_key 未设置');
    if (!this.config.base_url) throw new Error('LLM 配置错误: base_url 未设置');

    const opts: ConstructorParameters<typeof OpenAI>[0] = {
      apiKey: this.config.api_key,
      baseURL: this.config.base_url,
      timeout: this.config.timeout,
    };

    const proxy = this.resolveProxy(options.proxyEnvVars);
    if (proxy) {
      opts.fetchOptions = { dispatcher: new ProxyAgent({ uri: proxy, connectTimeout: this.config.timeout }) };
    }

    this.client = new OpenAI(opts);
  }

  async complete(systemPrompt: string, userContent: string): Promise<string> {
    const baseParams = {
      model: this.config.model,
      messages: [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userContent },
      ],
      ...(this.config.reasoning_effort && {
        reasoning_effort: this.config.reasoning_effort as 'low' | 'medium' | 'high',
      }),
      ...(this.config.max_completion_tokens && {
        max_completion_tokens: this.config.max_completion_tokens,
      }),
    };

    if (this.config.stream) {
      const stream = await this.client.chat.completions.create({ ...baseParams, stream: true as const });
      const chunks: string[] = [];
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) chunks.push(delta);
      }
      return chunks.join('');
    }

    const response = await this.client.chat.completions.create({ ...baseParams, stream: false as const });
    return response.choices[0]?.message?.content ?? '';
  }

  private resolveProxy(envVars: string[]): string | undefined {
    for (const key of envVars) {
      const val = process.env[key];
      if (val) return val;
    }
    return undefined;
  }
}
