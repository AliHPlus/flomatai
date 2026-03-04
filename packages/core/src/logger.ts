/**
 * Structured logger with level support and pluggable transports.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  data?: unknown;
}

export type LogTransport = (entry: LogEntry) => void;

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 99,
};

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m',  // cyan
  info: '\x1b[32m',   // green
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
  silent: '',
};
const RESET = '\x1b[0m';

function consoleTransport(entry: LogEntry): void {
  if (entry.level === 'silent') return;
  const color = COLORS[entry.level] ?? '';
  const prefix = `${color}[${entry.level.toUpperCase()}]${RESET}`;
  const ctx = entry.context ? ` \x1b[90m(${entry.context})\x1b[0m` : '';
  const msg = `${entry.timestamp} ${prefix}${ctx} ${entry.message}`;
  if (entry.data !== undefined) {
    const method = entry.level === 'error' ? 'error' : 'log';
    console[method](msg, entry.data);
  } else {
    const method = entry.level === 'error' ? 'error' : 'log';
    console[method](msg);
  }
}

export class Logger {
  private level: LogLevel;
  private context: string | undefined;
  private transports: LogTransport[];

  constructor(options: {
    level?: LogLevel;
    context?: string;
    transports?: LogTransport[];
  } = {}) {
    this.level = options.level ?? 'info';
    this.context = options.context;
    this.transports = options.transports ?? [consoleTransport];
  }

  child(context: string): Logger {
    return new Logger({
      level: this.level,
      context: this.context ? `${this.context}:${context}` : context,
      transports: this.transports,
    });
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private write(level: LogLevel, message: string, data?: unknown): void {
    if (LEVELS[level] < LEVELS[this.level]) return;
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: this.context,
      data,
    };
    for (const transport of this.transports) {
      transport(entry);
    }
  }

  debug(message: string, data?: unknown): void { this.write('debug', message, data); }
  info(message: string, data?: unknown): void  { this.write('info',  message, data); }
  warn(message: string, data?: unknown): void  { this.write('warn',  message, data); }
  error(message: string, data?: unknown): void { this.write('error', message, data); }
}

/** Default root logger. */
export const logger = new Logger({ level: (process.env['LOG_LEVEL'] as LogLevel) ?? 'info' });
