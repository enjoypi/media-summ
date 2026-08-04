import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ExternalDownloader, Logger } from '../../usecases/ports.js';

const execFileAsync = promisify(execFile);

interface YtDlpDownloaderOptions {
  urlPattern: string;
  subFormat: string;
}

export class YtDlpDownloader implements ExternalDownloader {
  private urlRegex: RegExp;

  constructor(
    private logger: Logger,
    private options: YtDlpDownloaderOptions,
  ) {
    this.urlRegex = new RegExp(options.urlPattern);
  }

  canHandle(url: string): boolean {
    return this.urlRegex.test(url);
  }

  async download(url: string, outputDir: string, options: { lang: string }): Promise<void> {
    const args = [
      '--write-sub',
      '--write-auto-sub',
      '--sub-lang',
      options.lang,
      '--sub-format',
      this.options.subFormat,
      '--skip-download',
      '--restrict-filenames',
      '-P',
      outputDir,
      '-o',
      '%(title)s.%(ext)s',
      url,
    ];

    this.logger.info(`yt-dlp 下载字幕: ${url}`);
    this.logger.debug(`yt-dlp ${args.join(' ')}`);

    try {
      const { stdout, stderr } = await execFileAsync('yt-dlp', args, { timeout: 120_000 });
      if (stdout) this.logger.info(stdout.trim());
      if (stderr) this.logger.warn(stderr.trim());
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.code === 'ENOENT') {
        throw new Error('yt-dlp 未安装。请先安装: brew install yt-dlp 或 pip install yt-dlp');
      }
      throw new Error(`yt-dlp 下载失败: ${error.message}`);
    }
  }
}
