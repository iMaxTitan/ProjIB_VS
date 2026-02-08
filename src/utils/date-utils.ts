import logger from '@/lib/logger';

/**
 * Утилиты для работы с датами и временем
 */

/**
 * Расчет продолжительности события в часах
 * @param start Время начала в формате ISO
 * @param end Время окончания в формате ISO
 * @returns Продолжительность в часах (с точностью до 1 десятичного знака)
 */
export function calculateDuration(start: string, end: string): number {
  try {
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // Расчет разницы в миллисекундах
    const durationInMs = endDate.getTime() - startDate.getTime();
    
    // Конвертация миллисекунд в часы с округлением до 1 знака после запятой
    const durationInHours = Math.round((durationInMs / (1000 * 60 * 60)) * 10) / 10;
    
    return durationInHours;
  } catch (error: unknown) {
    logger.error('Ошибка при расчете продолжительности:', error);
    return 0;
  }
}

/**
 * Форматирование даты и времени в локальный формат
 * @param dateString Строка даты в формате ISO
 * @returns Форматированная строка даты и времени
 */
export function formatDateTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  } catch (error: unknown) {
    logger.error('Ошибка форматирования даты и времени:', error);
    return dateString;
  }
}

/**
 * Форматирование только даты
 * @param dateString Строка даты в формате ISO
 * @returns Форматированная строка даты
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  } catch (error: unknown) {
    logger.error('Ошибка форматирования даты:', error);
    return dateString;
  }
}

/**
 * Форматирование только времени
 * @param dateString Строка даты в формате ISO
 * @returns Форматированная строка времени
 */
export function formatTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  } catch (error: unknown) {
    logger.error('Ошибка форматирования времени:', error);
    return dateString;
  }
}


