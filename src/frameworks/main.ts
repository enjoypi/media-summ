/**
 * @module frameworks/main
 * @description CLI 组装 — 注册子命令 + 向后兼容（直接传 URL 自动转发到 download）
 * @layer Frameworks
 */

import { Command } from 'commander';
import pkg from '../../package.json' with { type: 'json' };
import { registerDownload } from './download.js';
import { registerSummarize } from './summarize.js';
import { loadConfig } from './config-loader.js';

const USER_ARG_START = 2;

function buildProgram(): Command {
  const program = new Command();
  program.name('media-summ').description('在线课程字幕下载与总结工具').version(pkg.version);
  registerDownload(program);
  registerSummarize(program);
  return program;
}

// 向后兼容：argv 中直接传入 URL 时，自动注入 download 子命令
export function withImplicitDownload(args: string[], urlDetectPattern: string): string[] {
  const firstNonOption = args.findIndex((arg) => !arg.startsWith('-'));
  if (firstNonOption < 0) return args;
  if (!new RegExp(urlDetectPattern).test(args[firstNonOption]!)) return args;
  return [...args.slice(0, firstNonOption), 'download', ...args.slice(firstNonOption)];
}

export function main(args: string[]): void {
  const program = buildProgram();
  const config = loadConfig();

  // 未知子命令错误处理（FR-005）
  program.on('command:*', (operands: string[]) => {
    console.error(`错误: 未知子命令 '${operands[0]}'`);
    console.error(`可用子命令: ${program.commands.map((command) => command.name()).join(', ')}`);
    process.exit(config.exit_codes.general_error);
  });

  if (args.length === 0) {
    program.help();
  }
  const resolved = withImplicitDownload(args, config.url_patterns.url_detect_pattern);
  program.parse([...process.argv.slice(0, USER_ARG_START), ...resolved]);
}
