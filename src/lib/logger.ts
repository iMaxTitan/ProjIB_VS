/**
 * Единый логгер проекта.
 * Информационные логи выводим только в development,
 * ошибки логируем всегда.
 */
export const IS_DEV = process.env.NODE_ENV === 'development';

export const logger = {
  log: (...args: unknown[]) => {
    if (IS_DEV) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (IS_DEV) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
  info: (...args: unknown[]) => {
    if (IS_DEV) console.info(...args);
  },
  debug: (...args: unknown[]) => {
    if (IS_DEV) console.debug(...args);
  },
};

export default logger;
