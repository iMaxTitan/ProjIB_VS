/**
 * Интерфейсы для работы с Microsoft Graph API
 */

/**
 * Интерфейс для событий календаря
 */
export interface CalendarEvent {
  /**
   * Уникальный идентификатор события
   */
  id: string;
  /**
   * Тема события
   */
  subject: string;
  /**
   * Время начала события
   */
  start: {
    /**
     * Дата и время начала события в формате ISO 8601
     */
    dateTime: string;
    /**
     * Часовой пояс начала события
     */
    timeZone: string;
  };
  /**
   * Время окончания события
   */
  end: {
    /**
     * Дата и время окончания события в формате ISO 8601
     */
    dateTime: string;
    /**
     * Часовой пояс окончания события
     */
    timeZone: string;
  };
  /**
   * Место проведения события (необязательно)
   */
  location?: {
    /**
     * Отображаемое имя места проведения
     */
    displayName: string;
  };
  /**
   * Организатор события (необязательно)
   */
  organizer?: {
    /**
     * Адрес электронной почты организатора
     */
    emailAddress: {
      /**
       * Имя организатора
       */
      name: string;
      /**
       * Email организатора
       */
      address?: string;
    };
  };
  /**
   * Признак того, что событие длится весь день (необязательно)
   */
  isAllDay?: boolean;
  /**
   * Признак того, что событие является онлайн-встречей
   */
  isOnlineMeeting?: boolean;
  /**
   * Провайдер онлайн-встречи (Teams, Skype и т.д.)
   */
  onlineMeetingProvider?: string;
  /**
   * URL для присоединения к онлайн-встрече
   */
  onlineMeetingUrl?: string;
  /**
   * Информация об онлайн-встрече
   */
  onlineMeeting?: {
    /**
     * URL для присоединения к встрече
     */
    joinUrl?: string;
  };
}

/**
 * Интерфейс для пользователя Graph API
 */
export interface GraphUser {
  id: string;
  displayName: string;
  mail?: string;
  userPrincipalName: string;
  jobTitle?: string;
  department?: string;
}

/**
 * Параметры для запроса календаря
 */
export interface CalendarRequestOptions {
  startDate?: Date;
  endDate?: Date;
  accessToken?: string;
}

/**
 * Параметры для запроса Teams-встреч
 */
export interface TeamsMeetingsRequestOptions {
  accessToken?: string;
  startDateTime?: string;  // ISO формат, например '2025-04-16T00:00:00Z'
  endDateTime?: string;    // ISO формат
}

/**
 * Параметры запроса с опцией использования тестовых данных
 */
export interface MockDataRequestOptions {
  accessToken?: string;
  useMockData?: boolean;
}

/**
 * Параметры для запроса транскрипций
 */
export interface TranscriptionsRequestOptions extends MockDataRequestOptions {
  skipOrganizerCheck?: boolean; // Флаг для пропуска проверки организатора (только для отладки)
}
