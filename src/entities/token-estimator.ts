/**
 * @module entities/token-estimator
 * @description 基于字符数的 token 估算工具
 * @layer Entities
 */

const DEFAULT_CHARS_PER_TOKEN = 3;

export function estimateTokens(text: string, charsPerToken = DEFAULT_CHARS_PER_TOKEN): number {
  if (charsPerToken <= 0) {
    throw new Error(`charsPerToken must be positive, got ${charsPerToken}`);
  }
  return Math.ceil(text.length / charsPerToken);
}
