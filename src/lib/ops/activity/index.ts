/**
 * Activity service — barrel re-export.
 * Split into focused modules for maintainability:
 *   activity-types.ts    — types and interfaces
 *   activity-mappers.ts  — row-to-event mappers
 *   activity-feed.ts     — getActivityFeed + fallback chain
 *   activity-stats.ts    — getActivityStats, getDepartmentsForFilter, getAIContext
 */
export * from './types';
export * from './feed';
export * from './stats';
