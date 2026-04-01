'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, MeasuringStrategy, PointerSensor, useSensor, useSensors, pointerWithin, type Modifier } from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/shared/utils';
import { Spinner } from '@/components/ui/Spinner';
import { useWeeklyEntries, useCreateEntry, useBatchCreateEntries, useUpdateEntry, useDeleteEntry, useCopyWeek, useSuggestSlots, useUpdateLunch, useCollectTasks, PLANNER_ENTRIES_KEY, type WeeklyPlannerData } from '@/hooks/usePlanner';
import { usePullCalendar, usePushCalendar } from '@/hooks/usePlannerSync';
import type { SuggestedSlot } from '@/lib/ops/planner/weekly-suggest';
import type { CalendarEntry } from '@/lib/ops/planner/calendar-entries';
import { useCreateDraft, useDrafts } from '@/hooks/usePlannerDrafts';
import PlannerGrid, { type TemplateDragData, type ProcedureDragData } from './PlannerGrid';
import type { SelectPayload } from './TaskPickerDropdown';
import PlannerSidebar from './PlannerSidebar';
import PlannerHeader from './PlannerHeader';
import PlannerFilters from './PlannerFilters';
import PlannerStats from './PlannerStats';
import PlannerTasksDetail from './PlannerTasksDetail';
import CalendarMeetingModal from './CalendarMeetingModal';
import TasksModal, { type TasksModalState } from './TasksModal';
import { CalendarDays, ClipboardList } from 'lucide-react';
import { getWeekStart, getWeekEnd, toLocalDateStr, getWeekDates, resolveOverlaps } from './planner-helpers';

const DEFAULT_DURATION = 60;

// Overlay center follows cursor. activeNodeRect = original element rect (stable).
// Overlay style={{ width: 160 }}, height ~32px.
const OVERLAY_W = 160;
const OVERLAY_H = 32;
const snapCenter: Modifier = ({ activatorEvent, activeNodeRect, transform }) => {
  if (!activatorEvent || !activeNodeRect) return transform;
  const e = activatorEvent as PointerEvent;
  return {
    ...transform,
    x: transform.x + (e.clientX - activeNodeRect.left) - OVERLAY_W / 2,
    y: transform.y + (e.clientY - activeNodeRect.top) - OVERLAY_H / 2,
  };
};

export default function PlannerContent() {
  const today = useMemo(() => new Date(), []);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const weekStartStr = toLocalDateStr(weekStart);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  // ─── Data
  const { data, isLoading } = useWeeklyEntries(weekStartStr);
  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);
  const activePlans = useMemo(() => data?.activePlans ?? [], [data?.activePlans]);
  const lunchStart = data?.lunchStart ?? '13:00';
  const vacationDays = useMemo(() => new Set(data?.vacationDays ?? []), [data?.vacationDays]);

  const { data: draftsData } = useDrafts();
  const draftedSourceIds = useMemo(() => new Set<string>(draftsData?.meetingTaskIds ?? []), [draftsData?.meetingTaskIds]);
  const collectedProcedureIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of draftedSourceIds) {
      if (id.startsWith('proc:')) set.add(id.slice(5));
    }
    return set;
  }, [draftedSourceIds]);

  // ─── Mutations
  const createEntry = useCreateEntry(weekStartStr);
  const updateEntry = useUpdateEntry(weekStartStr);
  const deleteEntry = useDeleteEntry();
  const copyWeek = useCopyWeek();
  const createDraft = useCreateDraft();
  const batchCreate = useBatchCreateEntries(weekStartStr);
  const suggestMutation = useSuggestSlots(weekStartStr);
  const updateLunch = useUpdateLunch();
  const pullCalendar = usePullCalendar();
  const pushCalendar = usePushCalendar();
  const queryClient = useQueryClient();
  const [suggestions, setSuggestions] = useState<SuggestedSlot[]>([]);
  const [selectedProcedureId, setSelectedProcedureId] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<CalendarEntry | null>(null);

  // ─── PULL on week change (background, no spinner)
  const lastPulledWeek = useRef<string>('');
  const manualPull = useRef(false);
  useEffect(() => {
    if (weekStartStr && weekStartStr !== lastPulledWeek.current) {
      lastPulledWeek.current = weekStartStr;
      const we = getWeekEnd(weekStart);
      manualPull.current = false;
      pullCalendar.mutate({ weekStart: toLocalDateStr(weekStart), weekEnd: toLocalDateStr(we) });
    }
  }, [weekStartStr]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── DnD
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const d = event.active.data.current;
    if (d?.type === 'procedure') setDragLabel(d.procedureName as string);
    else if (d?.type === 'suggestion') {
      setDragLabel(d.procedureName as string || '');
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDragLabel(null);
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current;
    const overData = over.data.current;
    if (overData?.type !== 'cell') return;
    const targetDate = overData.date as string;
    const targetTime = overData.start_time as string;

    if (activeData?.type === 'procedure') {
      const droppedPlan = activePlans.find(p => p.monthlyPlanId === activeData.monthlyPlanId);
      if (droppedPlan?.status === 'done') return;

      // Drop procedure onto external event → assign monthly_plan_id
      const externalAtSlot = entries.find(e =>
        e.source === 'external' && e.date === targetDate &&
        e.start_time.slice(0, 5) === targetTime && !e.monthly_plan_id,
      );
      if (externalAtSlot) {
        const qk = [...PLANNER_ENTRIES_KEY, weekStartStr];
        queryClient.setQueryData<WeeklyPlannerData>(qk, (old) => {
          if (!old) return old;
          return { ...old, entries: old.entries.map((e) => e.id === externalAtSlot.id
            ? { ...e, monthly_plan_id: activeData.monthlyPlanId as string, procedure_name: activeData.procedureName as string }
            : e) };
        });
        updateEntry.mutate({ id: externalAtSlot.id, monthly_plan_id: activeData.monthlyPlanId as string });
        return;
      }

      const tempEntry = {
        id: '_tmp_' + Date.now(), employee_id: '',
        date: targetDate, start_time: targetTime, duration_minutes: DEFAULT_DURATION,
        source: 'plan' as const,
        monthly_plan_id: (activeData.monthlyPlanId as string) || null,
        outlook_event_id: null, daily_task_id: null, task_template_id: null,
        task_has_plan: false, task_completed: false,
        subject: null, has_transcript: false, transcript_summary: null,
        procedure_name: activeData.procedureName as string, process_name: '',
        task_title: null, task_description: null, outlook_modified: false, needs_push: false, template_title: null,
      };
      const shifts = resolveOverlaps(tempEntry.id, [...entries, tempEntry], targetDate);
      const hasCascade = shifts.length > 0;
      createEntry.mutate({
        monthly_plan_id: activeData.monthlyPlanId as string,
        date: targetDate, start_time: targetTime, duration_minutes: DEFAULT_DURATION,
        _procedureName: activeData.procedureName as string, _processName: '',
        ...(hasCascade ? { cascade: true } : {}),
      });
      for (const sh of shifts) updateEntry.mutate({ id: sh.id, start_time: sh.newStartTime, cascade: true });
      return;
    }

    if (activeData?.type === 'suggestion') {
      const sgId = activeData.suggestionId as string;
      setSuggestions((prev) => prev.map((s) => s._id === sgId ? { ...s, date: targetDate, start_time: targetTime } : s));
    }
  }, [createEntry, updateEntry, entries]);

  const handleDeleteEntry = useCallback((id: string) => deleteEntry.mutate(id), [deleteEntry]);

  const handleTemplateDrop = useCallback((date: string, startTime: string, data: TemplateDragData) => {
    createEntry.mutate({
      monthly_plan_id: data.monthlyPlanId,
      date,
      start_time: startTime,
      duration_minutes: data.durationMinutes,
      task_template_id: data.templateId,
      cascade: true,
      _procedureName: data.procedureName ?? '',
      _processName: '',
    });
  }, [createEntry]);

  const handleProcedureDrop = useCallback((date: string, startTime: string, data: ProcedureDragData) => {
    const droppedPlan = activePlans.find(p => p.monthlyPlanId === data.monthlyPlanId);
    if (droppedPlan?.status === 'done') return;

    // Drop onto external event → assign procedure
    const externalAtSlot = entries.find(e =>
      e.source === 'external' && e.date === date &&
      e.start_time.slice(0, 5) === startTime && !e.monthly_plan_id,
    );
    if (externalAtSlot) {
      updateEntry.mutate({ id: externalAtSlot.id, monthly_plan_id: data.monthlyPlanId });
      return;
    }

    // Create new entry
    const tempEntry = {
      id: '_tmp_' + Date.now(), employee_id: '',
      date, start_time: startTime, duration_minutes: DEFAULT_DURATION,
      source: 'plan' as const,
      monthly_plan_id: data.monthlyPlanId || null,
      outlook_event_id: null, daily_task_id: null, task_template_id: null,
      task_has_plan: false, task_completed: false,
      subject: null, has_transcript: false, transcript_summary: null,
      procedure_name: data.procedureName, process_name: '',
      task_title: null, task_description: null, outlook_modified: false, needs_push: false, template_title: null,
    };
    const shifts = resolveOverlaps(tempEntry.id, [...entries, tempEntry], date);
    createEntry.mutate({
      monthly_plan_id: data.monthlyPlanId,
      date, start_time: startTime, duration_minutes: DEFAULT_DURATION,
      _procedureName: data.procedureName, _processName: '',
      ...(shifts.length > 0 ? { cascade: true } : {}),
    });
    for (const sh of shifts) updateEntry.mutate({ id: sh.id, start_time: sh.newStartTime, cascade: true });
  }, [createEntry, updateEntry, entries, activePlans]);

  // ─── Native slot drop (CalendarBlock drag within grid)
  const handleSlotDrop = useCallback((date: string, startTime: string, entryId: string) => {
    const currentEntry = entries.find((e) => e.id === entryId);
    if (currentEntry && currentEntry.date === date && currentEntry.start_time.slice(0, 5) === startTime) return;
    const virtualEntries = entries.map((e) => e.id === entryId ? { ...e, date, start_time: startTime } : e);
    const shifts = resolveOverlaps(entryId, virtualEntries, date);
    const hasCascade = shifts.length > 0;
    updateEntry.mutate({ id: entryId, date, start_time: startTime, ...(hasCascade ? { cascade: true } : {}) });
    for (const sh of shifts) updateEntry.mutate({ id: sh.id, start_time: sh.newStartTime, cascade: true });
  }, [entries, updateEntry]);

  const handleResizeEntry = useCallback((id: string, newDurationMin: number) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) { updateEntry.mutate({ id, duration_minutes: newDurationMin }); return; }
    const virtualEntries = entries.map((e) => e.id === id ? { ...e, duration_minutes: newDurationMin } : e);
    const shifts = resolveOverlaps(id, virtualEntries, entry.date);
    const hasCascade = shifts.length > 0;
    updateEntry.mutate({ id, duration_minutes: newDurationMin, ...(hasCascade ? { cascade: true } : {}) });
    for (const sh of shifts) updateEntry.mutate({ id: sh.id, start_time: sh.newStartTime, cascade: true });
  }, [updateEntry, entries]);

  const handleCreateDraft = useCallback((desc: string, hours: number, date: string, sourceId?: string) => {
    if (sourceId && draftedSourceIds.has(sourceId)) return;
    createDraft.mutate({ description: desc, hours, date, meetingId: sourceId });
  }, [createDraft, draftedSourceIds]);

  const [taskModalState, setTaskModalState] = useState<TasksModalState>(null);

  const collectTasks = useCollectTasks();
  const handleCollectTasks = useCallback((procedureId: string) => {
    const plan = activePlans.find(p => p.procedureId === procedureId);
    if (!plan || plan.status === 'done') return;
    const planToProcedure = new Map(activePlans.map(p => [p.monthlyPlanId, p.procedureId]));
    // Only entries with template but no task yet
    // Plan entries with template (no task yet)
    const collectableEntries = entries.filter((e) =>
      e.task_template_id && !e.daily_task_id &&
      e.monthly_plan_id && planToProcedure.get(e.monthly_plan_id) === procedureId
    );
    // External entries with procedure + transcript (no task yet)
    const collectableExternal = entries.filter((e) =>
      e.source === 'external' && e.has_transcript && !e.daily_task_id &&
      e.monthly_plan_id && planToProcedure.get(e.monthly_plan_id) === procedureId &&
      !e.task_template_id
    );
    if (collectableEntries.length === 0 && collectableExternal.length === 0) return;
    collectTasks.mutate({
      procedureId,
      weekStart: weekStartStr,
      monthlyPlanId: plan.monthlyPlanId,
      entries: collectableEntries.map(e => ({
        id: e.id,
        task_template_id: e.task_template_id!,
        duration_minutes: e.duration_minutes,
        date: e.date,
      })),
      externalEntries: collectableExternal.map(e => ({
        id: e.id,
        duration_minutes: e.duration_minutes,
        date: e.date,
        subject: e.subject,
        transcript_summary: e.transcript_summary,
      })),
    });
  }, [activePlans, entries, collectTasks, weekStartStr]);

  // ─── Link template or procedure to entry
  const handleLinkTask = useCallback((entryId: string, task: SelectPayload) => {
    const qk = [...PLANNER_ENTRIES_KEY, weekStartStr];
    if (task.type === 'template') {
      queryClient.setQueryData<WeeklyPlannerData>(qk, (old) => {
        if (!old) return old;
        return { ...old, entries: old.entries.map((e) => e.id === entryId ? { ...e, task_template_id: task.templateId, template_title: task.title } : e) };
      });
      updateEntry.mutate({ id: entryId, task_template_id: task.templateId });
    } else if (task.type === 'procedure-only') {
      const plan = activePlans.find(p => p.monthlyPlanId === task.monthlyPlanId);
      queryClient.setQueryData<WeeklyPlannerData>(qk, (old) => {
        if (!old) return old;
        return { ...old, entries: old.entries.map((e) => e.id === entryId ? { ...e, monthly_plan_id: task.monthlyPlanId, procedure_name: plan?.procedureName ?? '' } : e) };
      });
      updateEntry.mutate({ id: entryId, monthly_plan_id: task.monthlyPlanId });
    }
  }, [updateEntry, queryClient, weekStartStr, activePlans]);

  // ─── Clear template from entry
  const handleClearTemplate = useCallback((entryId: string) => {
    const qk = [...PLANNER_ENTRIES_KEY, weekStartStr];
    queryClient.setQueryData<WeeklyPlannerData>(qk, (old) => {
      if (!old) return old;
      return { ...old, entries: old.entries.map((e) => e.id === entryId ? { ...e, task_template_id: null, template_title: null } : e) };
    });
    updateEntry.mutate({ id: entryId, task_template_id: null });
  }, [updateEntry, queryClient, weekStartStr]);

  // ─── Clear procedure from external entry
  const handleClearProcedure = useCallback((entryId: string) => {
    const qk = [...PLANNER_ENTRIES_KEY, weekStartStr];
    queryClient.setQueryData<WeeklyPlannerData>(qk, (old) => {
      if (!old) return old;
      return { ...old, entries: old.entries.map((e) => e.id === entryId ? { ...e, monthly_plan_id: null, procedure_name: '', task_template_id: null, template_title: null } : e) };
    });
    updateEntry.mutate({ id: entryId, monthly_plan_id: null, task_template_id: null });
  }, [updateEntry, queryClient, weekStartStr]);

  // ─── Meeting modal
  const handleSelectMeeting = useCallback((entry: CalendarEntry) => setSelectedMeeting(entry), []);
  const handleSummaryGenerated = useCallback((entryId: string, summary: string) => {
    const qk = [...PLANNER_ENTRIES_KEY, weekStartStr];
    queryClient.setQueryData<WeeklyPlannerData>(qk, (old) => {
      if (!old) return old;
      return { ...old, entries: old.entries.map((e) => e.id === entryId ? { ...e, transcript_summary: summary } : e) };
    });
    setSelectedMeeting((prev) => prev?.id === entryId ? { ...prev, transcript_summary: summary } : prev);
  }, [queryClient, weekStartStr]);
  const handleTranscriptConfirmed = useCallback((entryId: string) => {
    const qk = [...PLANNER_ENTRIES_KEY, weekStartStr];
    queryClient.setQueryData<WeeklyPlannerData>(qk, (old) => {
      if (!old) return old;
      return { ...old, entries: old.entries.map((e) => e.id === entryId ? { ...e, has_transcript: true } : e) };
    });
  }, [queryClient, weekStartStr]);

  // ─── Toolbar handlers
  const handleWeekChange = useCallback((ws: Date) => setWeekStart(ws), []);
  const handleCopy = useCallback(() => { if (!copyWeek.isPending) copyWeek.mutate(weekStartStr); }, [copyWeek, weekStartStr]);

  const handleSuggest = useCallback(() => {
    if (suggestMutation.isPending) return;
    suggestMutation.mutate(undefined, {
      onSuccess: (d) => setSuggestions(d.suggestions.map((s, i) => ({ ...s, _id: `_sg_${Date.now()}_${i}` }))),
    });
  }, [suggestMutation]);

  const handleAcceptAll = useCallback(() => {
    if (batchCreate.isPending) return;
    batchCreate.mutate(suggestions.map((sg) => ({
      monthly_plan_id: sg.monthly_plan_id || '',
      date: sg.date, start_time: sg.start_time, duration_minutes: sg.duration_minutes,
    })));
    setSuggestions([]);
  }, [batchCreate, suggestions]);

  const handleAcceptSuggestion = useCallback((id: string) => {
    const sg = suggestions.find((s) => s._id === id);
    if (!sg) return;
    createEntry.mutate({ monthly_plan_id: sg.monthly_plan_id || '', date: sg.date, start_time: sg.start_time, duration_minutes: sg.duration_minutes, _procedureName: sg.procedure_name, _processName: sg.process_name });
    setSuggestions((prev) => prev.filter((s) => s._id !== id));
  }, [suggestions, createEntry]);

  const handleDismissSuggestion = useCallback((id: string) => setSuggestions((prev) => prev.filter((s) => s._id !== id)), []);
  const handleResizeSuggestion = useCallback((id: string, dur: number) => setSuggestions((prev) => prev.map((s) => s._id === id ? { ...s, duration_minutes: dur } : s)), []);

  // ─── Resizable 3-column split: Sidebar | Calendar | Tasks
  const [leftPct, setLeftPct] = useState(25);
  const [midPct, setMidPct] = useState(40);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSplitterDown = useCallback((which: 'left' | 'right', e: React.PointerEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startLeft = leftPct;
    const startMid = midPct;
    const onMove = (ev: PointerEvent) => {
      const cursorPct = ((ev.clientX - rect.left) / rect.width) * 100;
      if (which === 'left') {
        const newLeft = Math.max(10, Math.min(25, cursorPct));
        const rightPct = 100 - newLeft - startMid;
        if (rightPct >= 15) {
          setLeftPct(newLeft);
        }
      } else {
        const newMid = cursorPct - startLeft;
        const rightPct = 100 - startLeft - newMid;
        if (newMid >= 25 && rightPct >= 15 && rightPct <= 35) {
          setMidPct(newMid);
        }
      }
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [leftPct, midPct]);

  // ─── Debug overlay
  const [debugMode, setDebugMode] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'procs' | 'tasks' | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const lastElRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!debugMode) return;
    const onMove = (ev: MouseEvent) => {
      let el = ev.target as HTMLElement | null;
      let found: HTMLElement | null = null;
      while (el && el !== document.body) { if (el.dataset?.el) { found = el; break; } el = el.parentElement; }
      if (found !== lastElRef.current) { lastElRef.current?.classList.remove('el-hover'); lastElRef.current = found; found?.classList.add('el-hover'); }
      const tip = tipRef.current;
      if (!tip) return;
      if (found) {
        const cat = found.dataset.elCat || 'base';
        tip.className = `visible cat-${cat}`;
        tip.textContent = found.dataset.el!;
        let x = ev.clientX + 14, y = ev.clientY - 30;
        if (x + 180 > window.innerWidth) x = ev.clientX - 180;
        if (y < 4) y = ev.clientY + 18;
        tip.style.left = `${x}px`; tip.style.top = `${y}px`;
      } else { tip.className = ''; }
    };
    const onLeave = () => { lastElRef.current?.classList.remove('el-hover'); lastElRef.current = null; if (tipRef.current) tipRef.current.className = ''; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseleave', onLeave); onLeave(); };
  }, [debugMode]);

  // ─── Error banner
  const anyError = createEntry.isError || batchCreate.isError || deleteEntry.isError || copyWeek.isError || updateEntry.isError || createDraft.isError || suggestMutation.isError || updateLunch.isError || pullCalendar.isError || pushCalendar.isError;
  const errorMessage = createEntry.error?.message || batchCreate.error?.message || deleteEntry.error?.message || updateEntry.error?.message || copyWeek.error?.message || createDraft.error?.message || suggestMutation.error?.message || updateLunch.error?.message || pullCalendar.error?.message || pushCalendar.error?.message;

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
    {debugMode && (
      <>
        <style>{`
          [data-el]{outline:2px dashed rgba(99,102,241,0.5)!important;outline-offset:-1px}
          [data-el-cat="zone"]{outline-color:rgba(30,41,59,0.4)!important}
          [data-el-cat="glass"]{outline-color:rgba(124,58,237,0.5)!important}
          [data-el-cat="base"]{outline-color:rgba(99,102,241,0.5)!important}
          [data-el-cat="detail"]{outline-color:rgba(37,99,235,0.5)!important}
          [data-el-cat="nav"]{outline-color:rgba(5,150,105,0.5)!important}
          [data-el-cat="action"]{outline-color:rgba(220,38,38,0.5)!important}
          [data-el-cat="extend"]{outline-color:rgba(217,119,6,0.5)!important}
          [data-el].el-hover{outline-style:solid!important;outline-width:2px!important}
          #planner-el-tooltip{position:fixed;z-index:9999;pointer-events:none;padding:3px 8px;border-radius:5px;font-size:11px;font-weight:600;font-family:ui-monospace,monospace;opacity:0;transition:opacity 0.1s;box-shadow:0 2px 8px rgba(0,0,0,0.15)}
          #planner-el-tooltip.visible{opacity:1}
          #planner-el-tooltip.cat-zone{background:#1e293b;color:#e2e8f0}
          #planner-el-tooltip.cat-glass{background:#7c3aed;color:white}
          #planner-el-tooltip.cat-base{background:#4f46e5;color:white}
          #planner-el-tooltip.cat-detail{background:#2563eb;color:white}
          #planner-el-tooltip.cat-nav{background:#059669;color:white}
          #planner-el-tooltip.cat-action{background:#dc2626;color:white}
          #planner-el-tooltip.cat-extend{background:#d97706;color:white}
        `}</style>
        <div ref={tipRef} id="planner-el-tooltip" />
      </>
    )}
    <div className="px-1 lg:px-2 pt-1 lg:pt-2 pb-16 lg:pb-2 relative min-h-full bg-slate-200">
      {/* Debug toggle */}
      <button onClick={() => setDebugMode(v => !v)} title="Показати назви елементів"
        className={cn(
          'absolute z-50 top-1.5 right-1.5 w-6 h-6 rounded-md border-none cursor-pointer flex items-center justify-center text-xs font-bold',
          debugMode ? 'bg-indigo-500/15 text-indigo-600' : 'bg-slate-400/10 text-slate-400',
        )}>◎</button>
      {/* Mobile-only: week filters */}
      <div className="flex lg:hidden mb-2">
        <div className="glass-panel rounded-xl p-2 flex-1" data-el="L1 zone · mobile-filters" data-el-cat="glass">
          <PlannerFilters weekStart={weekStart} onWeekChange={handleWeekChange} />
        </div>
      </div>

      {/* ── 3-COLUMN RESIZABLE LAYOUT (desktop) ── */}
      <div ref={containerRef} className="hidden lg:flex flex-row h-[calc(100vh-118px)]">
        {/* ── LEFT: Sidebar ── */}
        <div className="flex flex-col gap-2 min-w-0 overflow-clip" style={{ width: `${leftPct}%` }}>
          <div className="glass-panel rounded-xl flex-shrink-0 p-2" data-el="L1 zone · filters" data-el-cat="glass">
            <PlannerFilters weekStart={weekStart} onWeekChange={handleWeekChange} />
          </div>

          <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-y-auto custom-scroll p-1" data-el="L1 zone · sidebar" data-el-cat="glass">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Spinner size="sm" /></div>
            ) : (
              <PlannerSidebar
                activePlans={activePlans} entries={entries} suggestions={suggestions}
                selectedProcedureId={selectedProcedureId} collectedProcedureIds={collectedProcedureIds}
                onSelectProcedure={(id) => setSelectedProcedureId((prev) => prev === id ? null : id)}
                onCollectTasks={handleCollectTasks}
              />
            )}
          </div>

          <div className="glass-panel rounded-xl flex-shrink-0" style={{ padding: '6px 8px' }} data-el="L1 zone · stats" data-el-cat="glass">
            <PlannerStats entries={entries} activePlans={activePlans} />
          </div>
        </div>

        {/* ── Splitter 1: left | middle ── */}
        <div
          className="flex items-center justify-center flex-shrink-0 cursor-col-resize select-none group"
          style={{ width: 8 }}
          onPointerDown={(e) => handleSplitterDown('left', e)}
        >
          <div className="w-[3px] h-10 rounded-full bg-slate-300/60 group-hover:bg-indigo-400/60 group-active:bg-indigo-500/80 transition-colors" />
        </div>

        {/* ── MIDDLE: Calendar ── */}
        <div className="flex flex-col min-w-0 overflow-clip" style={{ width: `${midPct}%` }}>
          <div className="glass-panel rounded-xl flex flex-col flex-1 min-h-0 p-2" data-el="L1 zone · calendar" data-el-cat="glass">
            <div className="element-card flex flex-col flex-1 min-h-0" style={{ borderRadius: 12, overflow: 'clip' }} data-el="L2 element-card · cal-table" data-el-cat="base">
              <PlannerHeader
                hasSuggestions={suggestions.length > 0}
                suggestPending={suggestMutation.isPending} copyPending={copyWeek.isPending}
                lunchStart={lunchStart} lunchPending={updateLunch.isPending}
                pushPending={pushCalendar.isPending} pullPending={pullCalendar.isPending && manualPull.current}
                hasUnsynced={entries.some(e => e.source === 'plan' && !e.outlook_event_id)}
                hasNeedsPush={entries.some(e => e.source === 'plan' && e.needs_push)}
                unsyncedCount={entries.filter(e => e.source === 'plan' && (!e.outlook_event_id || e.needs_push)).length}
                hasOutlookModified={entries.some(e => e.outlook_modified)}
                onPushSync={() => pushCalendar.mutate(weekStartStr)}
                onPullSync={() => {
                  manualPull.current = true;
                  const we = getWeekEnd(weekStart);
                  pullCalendar.mutate({ weekStart: toLocalDateStr(weekStart), weekEnd: toLocalDateStr(we) });
                }}
                onAcceptAll={handleAcceptAll} onClearSuggestions={() => setSuggestions([])}
                onSuggest={handleSuggest} onCopy={handleCopy}
                onUpdateLunch={(t) => updateLunch.mutate(t)}
              />

              {isLoading ? (
                <div className="flex items-center justify-center py-12"><Spinner size="sm" /></div>
              ) : (
                <PlannerGrid
                  weekDates={weekDates} entries={entries} suggestions={suggestions}
                  lunchStart={lunchStart} selectedProcedureId={selectedProcedureId}
                  activePlans={activePlans}
                  vacationDays={vacationDays}
                  onDeleteEntry={handleDeleteEntry} onResizeEntry={handleResizeEntry}
                  onSelectEntry={handleSelectMeeting}
                  onLinkTask={handleLinkTask} onClearTemplate={handleClearTemplate} onClearProcedure={handleClearProcedure}
                  onAcceptSuggestion={handleAcceptSuggestion} onDismissSuggestion={handleDismissSuggestion}
                  onResizeSuggestion={handleResizeSuggestion}
                  onTemplateDrop={handleTemplateDrop}
                  onProcedureDrop={handleProcedureDrop}
                  onSlotDrop={handleSlotDrop}
                />
              )}

              {anyError && (
                <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600 flex-shrink-0">
                  {errorMessage}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Splitter 2: middle | right ── */}
        <div
          className="flex items-center justify-center flex-shrink-0 cursor-col-resize select-none group"
          style={{ width: 8 }}
          onPointerDown={(e) => handleSplitterDown('right', e)}
        >
          <div className="w-[3px] h-10 rounded-full bg-slate-300/60 group-hover:bg-indigo-400/60 group-active:bg-indigo-500/80 transition-colors" />
        </div>

        {/* ── RIGHT: Tasks ── */}
        <div className="flex flex-col min-w-0 overflow-clip" style={{ width: `${Math.max(100 - leftPct - midPct, 15)}%` }}>
          <div className="glass-panel rounded-xl flex flex-col flex-1 min-h-0 p-2" data-el="L1 zone · tasks-detail" data-el-cat="glass">
            {(() => {
              const selectedPlan = selectedProcedureId ? activePlans.find(p => p.procedureId === selectedProcedureId) : null;
              if (!selectedPlan) {
                return (
                  <div className="flex flex-col items-center justify-center flex-1 text-slate-400 gap-2">
                    <ClipboardList className="h-8 w-8 opacity-40" />
                    <p className="text-xs">Оберіть процедуру зліва</p>
                  </div>
                );
              }
              return (
                <div className="element-card cal-table" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} data-el="L2 element-card · tasks-detail" data-el-cat="base">
                  <PlannerTasksDetail plan={selectedPlan} onClose={() => setSelectedProcedureId(null)}
                    readOnly={selectedPlan.status === 'done'}
                    onAddTask={() => setTaskModalState({ mode: 'create', plan: selectedPlan })}
                    onEditTask={(task) => setTaskModalState({ mode: 'edit', plan: selectedPlan, task })}
                  />
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── MOBILE LAYOUT: Calendar only (sidebar/tasks via bottom sheet) ── */}
      <div className="flex flex-col gap-2 lg:hidden">
        <div className="glass-panel rounded-xl flex flex-col p-2" data-el="L1 zone · calendar" data-el-cat="glass">
          <div className="element-card flex flex-col flex-1 min-h-0" style={{ borderRadius: 12, overflow: 'clip' }} data-el="L2 element-card · cal-table" data-el-cat="base">
            <PlannerHeader
              hasSuggestions={suggestions.length > 0}
              suggestPending={suggestMutation.isPending} copyPending={copyWeek.isPending}
              lunchStart={lunchStart} lunchPending={updateLunch.isPending}
              pushPending={pushCalendar.isPending} pullPending={pullCalendar.isPending && manualPull.current}
              hasUnsynced={entries.some(e => e.source === 'plan' && !e.outlook_event_id)}
              hasNeedsPush={entries.some(e => e.source === 'plan' && e.needs_push)}
              unsyncedCount={entries.filter(e => e.source === 'plan' && (!e.outlook_event_id || e.needs_push)).length}
              hasOutlookModified={entries.some(e => e.outlook_modified)}
              onPushSync={() => pushCalendar.mutate(weekStartStr)}
              onPullSync={() => {
                manualPull.current = true;
                const we = getWeekEnd(weekStart);
                pullCalendar.mutate({ weekStart: toLocalDateStr(weekStart), weekEnd: toLocalDateStr(we) });
              }}
              onAcceptAll={handleAcceptAll} onClearSuggestions={() => setSuggestions([])}
              onSuggest={handleSuggest} onCopy={handleCopy}
              onUpdateLunch={(t) => updateLunch.mutate(t)}
            />
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Spinner size="sm" /></div>
            ) : (
              <PlannerGrid
                weekDates={weekDates} entries={entries} suggestions={suggestions}
                lunchStart={lunchStart} selectedProcedureId={selectedProcedureId}
                activePlans={activePlans}
                vacationDays={vacationDays}
                onDeleteEntry={handleDeleteEntry} onResizeEntry={handleResizeEntry}
                onSelectEntry={handleSelectMeeting}
                onLinkTask={handleLinkTask} onClearTemplate={handleClearTemplate} onClearProcedure={handleClearProcedure}
                onAcceptSuggestion={handleAcceptSuggestion} onDismissSuggestion={handleDismissSuggestion}
                onResizeSuggestion={handleResizeSuggestion}
              />
            )}
            {anyError && (
              <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600 flex-shrink-0">
                {errorMessage}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DragOverlay */}
      <DragOverlay dropAnimation={null} modifiers={[snapCenter]}>
        {dragLabel && (
          <div className="data-cell cal-block st-distributed" style={{ width: 160, cursor: 'grabbing' }}>
            <p className="cal-subj">{dragLabel}</p>
          </div>
        )}
      </DragOverlay>

      <CalendarMeetingModal
        entry={selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        onSummaryGenerated={handleSummaryGenerated}
        onTranscriptConfirmed={handleTranscriptConfirmed}
      />

      <TasksModal
        state={taskModalState}
        weekStart={weekStartStr}
        onClose={() => setTaskModalState(null)}
      />

      {/* Mobile FAB row */}
      <div className="mob-fab-row">
        <button className="mob-fab procs" type="button"
          onClick={() => setMobilePanel(prev => prev === 'procs' ? null : 'procs')}>
          <CalendarDays className="h-3.5 w-3.5" /> Плани
        </button>
        <button className="mob-fab tasks" type="button"
          onClick={() => setMobilePanel(prev => prev === 'tasks' ? null : 'tasks')}>
          <ClipboardList className="h-3.5 w-3.5" /> Задачі
        </button>
      </div>

      {/* Mobile bottom sheet */}
      <div className={'mob-bottom-sheet' + (mobilePanel ? ' open' : '')}>
        <div style={{ padding: '4px 0 8px', cursor: 'pointer' }} onClick={() => setMobilePanel(null)}>
          <div className="mob-sheet-handle" />
        </div>
        <div className="px-3 pb-1 text-xs font-semibold text-slate-500">
          {mobilePanel === 'procs' ? 'Процедури' : 'Мої задачі'}
        </div>
        <div className="mob-sheet-body px-2">
          {mobilePanel === 'procs' && (
            <PlannerSidebar
              activePlans={activePlans} entries={entries} suggestions={suggestions}
              selectedProcedureId={selectedProcedureId} collectedProcedureIds={collectedProcedureIds}
              onSelectProcedure={(id) => { setSelectedProcedureId(prev => prev === id ? null : id); setMobilePanel(null); }}
              onCollectTasks={handleCollectTasks}
            />
          )}
          {mobilePanel === 'tasks' && selectedProcedureId && (() => {
            const selectedPlan = activePlans.find(p => p.procedureId === selectedProcedureId);
            if (!selectedPlan) return <div className="p-4 text-slate-400 text-xs">Оберіть процедуру</div>;
            return (
              <PlannerTasksDetail plan={selectedPlan} onClose={() => setMobilePanel(null)}
                readOnly={selectedPlan.status === 'done'}
                onAddTask={() => { setTaskModalState({ mode: 'create', plan: selectedPlan }); setMobilePanel(null); }}
                onEditTask={(task) => { setTaskModalState({ mode: 'edit', plan: selectedPlan, task }); setMobilePanel(null); }}
              />
            );
          })()}
          {mobilePanel === 'tasks' && !selectedProcedureId && (
            <div className="p-4 text-slate-400 text-xs">Спочатку оберіть процедуру у вкладці &quot;Плани&quot;</div>
          )}
        </div>
      </div>
    </div>
    </DndContext>
  );
}
