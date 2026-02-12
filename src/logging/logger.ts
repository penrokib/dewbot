import type { Logger, LogLevel } from "../types.js";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Structured JSON logger.
 *
 * Each log entry is a single JSON line written to stdout (or stderr for
 * error-level messages). Messages below the configured threshold are
 * silently discarded.
 */
export class DewBotLogger implements Logger {
  private readonly threshold: number;

  constructor(private readonly level: LogLevel) {
    this.threshold = LEVEL_PRIORITY[level] ?? LEVEL_PRIORITY.info;
  }

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.log("debug", msg, meta);
  }

  info(msg: string, meta?: Record<string, unknown>): void {
    this.log("info", msg, meta);
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    this.log("warn", msg, meta);
  }

  error(msg: string, meta?: Record<string, unknown>): void {
    this.log("error", msg, meta);
  }

  private log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < this.threshold) {
      return;
    }

    const entry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...meta,
    };

    const line = JSON.stringify(entry);

    if (level === "error") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }
}
