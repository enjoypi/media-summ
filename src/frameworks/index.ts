#!/usr/bin/env node

/**
 * @module frameworks/index
 * @description CLI 入口 — 注册子命令 + 向后兼容（直接传 URL 自动转发到 download）
 * @depends cli/download
 */

import { Command } from 'commander';
import { registerDownload } from './download.js';
import { registerSummarize } from './summarize.js';
import { readFileSync } from 'node:fs';
import { loadConfig } from './config-loader.js';

declare const __APP_VERSION__: string | undefined;

const version =
  typeof __APP_VERSION__ !== 'undefined'
    ? __APP_VERSION__
    : JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')).version;

const program = new Command();

program
  .name('media-summ')
  .description('在线课程字幕下载与总结工具')
  .version(version);

registerDownload(program);
registerSummarize(program);

// 向后兼容：argv 中直接传入 URL 时，自动注入 download 子命令
const userArgStart = 2;
const args = process.argv.slice(userArgStart);
const config = loadConfig();
const urlDetectPattern = new RegExp(config.url_patterns.url_detect_pattern);
const firstNonOptionIdx = args.findIndex((a) => !a.startsWith('-'));
if (firstNonOptionIdx >= 0 && urlDetectPattern.test(args[firstNonOptionIdx])) {
  process.argv.splice(userArgStart + firstNonOptionIdx, 0, 'download');
}

// 未知子命令错误处理（FR-005）
program.on('command:*', (operands: string[]) => {
  console.error(`错误: 未知子命令 '${operands[0]}'`);
  console.error(`可用子命令: ${program.commands.map((c) => c.name()).join(', ')}`);
  process.exit(1);
});

// 无参数时显示帮助
if (process.argv.length <= userArgStart) {
  program.help();
}

program.parse();
