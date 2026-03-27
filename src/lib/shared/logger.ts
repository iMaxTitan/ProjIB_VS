/**
 * Единый логгер проекта.
 * Информационные логи выводим только в development,
 * ошибки логируем всегда.
 */
export const IS_DEV = process.env.NODE_ENV === 'development';

function normalizeLogArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    return {
      name: arg.name,
      message: arg.message,
      stack: arg.stack,
    };
  }

  if (arg && typeof arg === 'object') {
    const maybe = arg as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      status?: unknown;
      statusText?: unknown;
      error?: unknown;
    };

    const normalized: Record<string, unknown> = {};
    if (typeof maybe.message === 'string' && maybe.message) normalized.message = maybe.message;
    if (typeof maybe.code === 'string' && maybe.code) normalized.code = maybe.code;
    if (maybe.details != null) normalized.details = maybe.details;
    if (typeof maybe.hint === 'string' && maybe.hint) normalized.hint = maybe.hint;
    if (maybe.status != null) normalized.status = maybe.status;
    if (maybe.statusText != null) normalized.statusText = maybe.statusText;
    if (maybe.error != null) normalized.error = maybe.error;

    if (Object.keys(normalized).length > 0) {
      return normalized;
    }

    // Some libs throw opaque empty objects; try JSON.stringify as fallback.
    try {
      const json = JSON.stringify(arg);
      if (json && json !== '{}') return `[opaque error] ${json}`;
    } catch { /* non-serializable */ }
    return '[empty error object]';
  }

  return arg;
}

function normalizeLogArgs(args: unknown[]): unknown[] {
  return args.map(normalizeLogArg);
}

export const logger = {
  log: (...args: unknown[]) => {
    if (IS_DEV) console.log(...normalizeLogArgs(args));
  },
  warn: (...args: unknown[]) => {
    if (IS_DEV) console.warn(...normalizeLogArgs(args));
  },
  error: (...args: unknown[]) => {
    console.error(...normalizeLogArgs(args));
  },
  info: (...args: unknown[]) => {
    if (IS_DEV) console.info(...normalizeLogArgs(args));
  },
  debug: (...args: unknown[]) => {
    if (IS_DEV) console.debug(...normalizeLogArgs(args));
  },
  /** Always outputs — for key production metrics (not errors). */
  prod: (...args: unknown[]) => {
    console.log(...normalizeLogArgs(args));
  },
};

export default logger;
