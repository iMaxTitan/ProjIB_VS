/**
 * Модуль для работы с Microsoft Graph API
 * Все импорты сервисов Graph должны идти через этот модуль
 */

// Экспорт сервисов
export { GraphAuthService } from './auth-service';
export { GraphUsersService } from './users-service';
export { GraphCalendarService } from './calendar-service';
export { GraphMeetingsService } from './meetings-service';
export { GraphTranscriptionsService } from './transcriptions-service';

// Реэкспорт типов
export type * from '@/types/graph-types';
