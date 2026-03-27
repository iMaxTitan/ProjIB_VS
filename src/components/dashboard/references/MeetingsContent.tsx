'use client';

import React, { useState, useMemo } from 'react';
import { useAllEmployees } from '@/hooks/useEmployees';
import { useMeetings } from '@/hooks/useMeetings';
import { ChevronLeft, ChevronRight, Video, Calendar } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { cn } from '@/lib/shared/utils';
import TwoPanelLayout from '../shared/TwoPanelLayout';
import ReferenceLeftPanelShell from './ReferenceLeftPanelShell';
import ReferenceListItem from '../shared/ReferenceListItem';
import MeetingRightPanel from './MeetingRightPanel';
import type { MeetingInfo } from '@/lib/ops/graph/meetings';

interface Props {
  user: UserInfo;
  tabsSlot: React.ReactNode;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

/** Get Monday of the week containing the given date */
function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Get Sunday (end) of the week */
function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function formatWeekRange(start: Date, end: Date): string {
  const sMonth = start.toLocaleDateString('uk-UA', { month: 'short' });
  const eMonth = end.toLocaleDateString('uk-UA', { month: 'short' });
  const sDay = start.getDate();
  const eDay = end.getDate();
  if (sMonth === eMonth) {
    return `${sDay} – ${eDay} ${sMonth} ${start.getFullYear()}`;
  }
  return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${start.getFullYear()}`;
}

// ─── Week navigation ──────────────────────────────────────────────────────────

interface WeekNavProps {
  weekStart: Date;
  isCurrentWeek: boolean;
  onPrev: () => void;
  onNext: () => void;
}

function WeekNav({ weekStart, isCurrentWeek, onPrev, onNext }: WeekNavProps) {
  const weekEnd = getWeekEnd(weekStart);
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-white/40">
      <button
        onClick={onPrev}
        aria-label="Попередній тиждень"
        className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="text-sm font-semibold text-slate-700 select-none">
        {formatWeekRange(weekStart, weekEnd)}
      </span>
      <button
        onClick={onNext}
        disabled={isCurrentWeek}
        aria-label="Наступний тиждень"
        className={cn(
          'p-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500',
          isCurrentWeek ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-slate-800 hover:bg-white/60',
        )}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// ─── Meeting list item ────────────────────────────────────────────────────────

interface MeetingItemProps {
  meeting: MeetingInfo;
  isSelected: boolean;
  onSelect: () => void;
}

function MeetingItem({ meeting, isSelected, onSelect }: MeetingItemProps) {
  return (
    <ReferenceListItem
      tone="indigo"
      isSelected={isSelected}
      onClick={onSelect}
      ariaLabel={`Нарада: ${meeting.subject}`}
    >
      <div className="flex items-center gap-2.5">
        <div className={cn(
          'p-1.5 rounded-lg flex-shrink-0',
          meeting.hasTranscript
            ? (isSelected ? 'bg-indigo-200 text-indigo-700' : 'bg-indigo-100 text-indigo-500')
            : (isSelected ? 'bg-slate-200 text-slate-500' : 'bg-slate-100 text-slate-400'),
        )}>
          <Video className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm font-medium leading-snug truncate',
            isSelected ? 'text-indigo-900' : 'text-slate-800',
          )}>
            {meeting.subject}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-slate-400">{formatDate(meeting.startDateTime)}</span>
            <span className="text-xs text-slate-300">·</span>
            <span className="text-xs text-slate-400">{meeting.durationMin} хв</span>
            {meeting.hasTranscript && (
              <span className="text-2xs bg-emerald-100 text-emerald-600 px-1.5 rounded-full font-medium leading-5">📝</span>
            )}
          </div>
        </div>
      </div>
    </ReferenceListItem>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MeetingsContent({ user, tabsSlot }: Props) {
  const today = useMemo(() => new Date(), []);
  const currentWeekStart = useMemo(() => getWeekStart(today), [today]);

  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));

  const { employees } = useAllEmployees();
  const employeeEmails = useMemo(
    () => new Set((employees ?? []).map(e => (e.email ?? '').toLowerCase())),
    [employees],
  );
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingInfo | null>(null);

  const isCurrentWeek = weekStart.getTime() === currentWeekStart.getTime();

  const prevWeek = () => {
    setSelectedMeeting(null);
    setWeekStart(ws => {
      const prev = new Date(ws);
      prev.setDate(prev.getDate() - 7);
      return prev;
    });
  };

  const nextWeek = () => {
    if (isCurrentWeek) return;
    setSelectedMeeting(null);
    setWeekStart(ws => {
      const next = new Date(ws);
      next.setDate(next.getDate() + 7);
      // Don't go past current week
      if (next.getTime() > currentWeekStart.getTime()) return currentWeekStart;
      return next;
    });
  };

  const weekEnd = useMemo(() => getWeekEnd(weekStart), [weekStart]);

  const { meetings, noTeams, isLoading, error } = useMeetings(
    weekStart.toISOString(),
    weekEnd.toISOString(),
  );
  const selectedKey = selectedMeeting
    ? `${selectedMeeting.meetingId}-${selectedMeeting.startDateTime}`
    : 'empty';

  const leftPanelHeader = (
    <>
      {tabsSlot}
      <WeekNav
        weekStart={weekStart}
        isCurrentWeek={isCurrentWeek}
        onPrev={prevWeek}
        onNext={nextWeek}
      />
    </>
  );

  const withTranscript = meetings.filter(m => m.hasTranscript).length;

  return (
    <TwoPanelLayout
      initialWidth={360}
      minWidth={260}
      maxWidth={480}
      rightPanelClassName={cn('overscroll-contain', selectedMeeting ? 'bg-indigo-50/30' : 'bg-transparent')}
      leftPanel={
        <ReferenceLeftPanelShell
          tabsSlot={leftPanelHeader}
          loading={isLoading}
          error={error ? String(error) : null}
          isEmpty={!isLoading && !error && !noTeams && meetings.length === 0}
          emptyState={
            <div className="text-center px-6 py-14 text-slate-400">
              <Calendar className="h-10 w-10 mx-auto mb-3 text-slate-300" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-500">Нарад не знайдено</p>
              <p className="text-xs mt-1">{formatWeekRange(weekStart, weekEnd)}</p>
            </div>
          }
          body={
            noTeams ? (
              <div className="text-center px-6 py-14 text-slate-400">
                <Video className="h-10 w-10 mx-auto mb-3 text-slate-300" aria-hidden="true" />
                <p className="text-sm font-medium text-slate-500">Teams не підключено</p>
                <p className="text-xs mt-1">Підключіть Teams-акаунт у профілі</p>
              </div>
            ) : (
              meetings.map(m => (
                <MeetingItem
                  key={`${m.meetingId}-${m.startDateTime}`}
                  meeting={m}
                  isSelected={`${m.meetingId}-${m.startDateTime}` === selectedKey}
                  onSelect={() => setSelectedMeeting(m)}
                />
              ))
            )
          }
          footer={
            <div className="flex items-center gap-2 text-slate-500">
              <Video className="h-4 w-4 text-indigo-500" aria-hidden="true" />
              <span className="text-sm">
                {meetings.length} нарад
                {withTranscript > 0 && `, ${withTranscript} з транскриптом`}
              </span>
            </div>
          }
          bodyClassName="space-y-1.5"
        />
      }
      rightPanel={
        <MeetingRightPanel
          key={selectedKey}
          meeting={selectedMeeting}
          userId={user.user_id}
          employeeEmails={employeeEmails}
        />
      }
    />
  );
}
