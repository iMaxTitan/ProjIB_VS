/**
 * Модуль для работы с Microsoft Graph API
 * Этот файл обеспечивает обратную совместимость с использованием GraphService
 * В новом коде рекомендуется импортировать сервисы напрямую из '@/services/graph'
 */

// Импорт типов
import { 
  CalendarEvent, 
  GraphUser, 
  CalendarRequestOptions, 
  TeamsMeetingsRequestOptions,
  MockDataRequestOptions,
  TranscriptionsRequestOptions 
} from '@/types/graph-types';

// Импорт утилит для работы с датами
import { 
  calculateDuration, 
  formatDateTime, 
  formatDate, 
  formatTime 
} from '@/utils/date-utils';

// Импорт сервисов из новой модульной структуры
import { GraphAuthService } from './graph/auth-service';
import { GraphUsersService } from './graph/users-service';
import { GraphCalendarService } from './graph/calendar-service';
import { GraphMeetingsService } from './graph/meetings-service';
import { GraphTranscriptionsService } from './graph/transcriptions-service';

// Реэкспорт типов для обратной совместимости
export type {
  CalendarEvent,
  GraphUser,
  CalendarRequestOptions,
  TeamsMeetingsRequestOptions,
  MockDataRequestOptions,
  TranscriptionsRequestOptions
};

/**
 * Класс для работы с Microsoft Graph API
 * Все обращения к Graph должны идти через этот сервис
 */
export class GraphService {
  /**
   * Базовый URL для Microsoft Graph API
   */
  static readonly apiBaseUrl = GraphAuthService.apiBaseUrl;
  
  // Аутентификация
  static getAccessToken = GraphAuthService.getAccessToken;
  
  // Пользователи
  static searchUserByEmail = GraphUsersService.searchUserByEmail;
  static getUserPhoto = GraphUsersService.getUserPhoto;
  static getUserData = GraphUsersService.getUserData;
  
  // Календарь и события
  static getCalendarEvents = GraphCalendarService.getCalendarEvents;
  static getTeamsMeetings = GraphCalendarService.getTeamsMeetings;
  
  // Встречи
  static getMeetingRecordings = GraphMeetingsService.getMeetingRecordings;
  static getMockMeetingRecordings = GraphMeetingsService.getMockMeetingRecordings;
  static getOnlineMeetingId = GraphMeetingsService.getOnlineMeetingId;
  
  // Транскрипции
  static getMeetingTranscriptions = GraphTranscriptionsService.getMeetingTranscriptions;
  static getMockMeetingTranscriptions = GraphTranscriptionsService.getMockMeetingTranscriptions;
  static getTranscriptionContent = GraphTranscriptionsService.getTranscriptionContent;
  static getMockTranscriptionContent = GraphTranscriptionsService.getMockTranscriptionContent;
}

// Экспорт утилит для работы с датами
export {
  calculateDuration,
  formatDateTime,
  formatDate,
  formatTime
};
