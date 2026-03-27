// Re-export from plans/Tasks — AddTaskModal has deep plan-specific dependencies
// that will be refactored in a later phase. For now, re-export the original.
// TODO: Phase 7 — migrate AddTaskModal internals to planner hooks
export { default, default as AddTaskModal } from '@/components/dashboard/plans/Tasks/AddTaskModal';
export type { default as AddTaskModalType } from '@/components/dashboard/plans/Tasks/AddTaskModal';
