'use client';

import React, { useState } from 'react';
import {
  FileText, Sparkles, Video, Clock, AlertCircle, Loader2,
  Calendar, MessageSquare, Users,
} from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Button } from '@/components/ui/Button';
import { GradientDetailCard, DetailSection } from '../shared';
import ReferenceDetailsEmptyState from './ReferenceDetailsEmptyState';
import type { MeetingInfo, TranscriptSegment } from '@/lib/ops/graph/meetings';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

const RESPONSE_STYLE: Record<string, string> = {
  organizer:           'bg-indigo-100 text-indigo-700',
  accepted:            'bg-emerald-100 text-emerald-700',
  declined:            'bg-red-100 text-red-600',
  tentativelyAccepted: 'bg-amber-100 text-amber-700',
  notResponded:        'bg-slate-100 text-slate-500',
  none:                'bg-slate-100 text-slate-400',
};

const RESPONSE_LABEL: Record<string, string> = {
  organizer:           'Організатор',
  accepted:            'Прийнято',
  declined:            'Відхилено',
  tentativelyAccepted: 'Можливо',
  notResponded:        'Не відповів',
  none:                '—',
};

interface Props {
  meeting: MeetingInfo | null;
  userId: string;
  employeeEmails: Set<string>;
}

export default function MeetingRightPanel({ meeting, userId, employeeEmails }: Props) {
  const [summaryHtml, setSummaryHtml] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptLoaded, setTranscriptLoaded] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  if (!meeting) {
    return (
      <ReferenceDetailsEmptyState
        icon={<Video className="h-16 w-16" aria-hidden="true" />}
        title="Оберіть нараду"
        description="Деталі, транскрипт та AI-резюме відображаться тут"
      />
    );
  }

  // Attendees split (after early return — safe, no hooks)
  const our = meeting.attendees.filter(a => employeeEmails.has(a.email.toLowerCase()));
  const ext = meeting.attendees.filter(a => !employeeEmails.has(a.email.toLowerCase()));
  const totalAttendees = meeting.attendees.length;

  const AttendeeChip = ({ a, external }: { a: MeetingInfo['attendees'][0]; external?: boolean }) => (
    <div className={cn(
      'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border shadow-sm',
      external ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200',
    )}>
      <span className="text-sm font-medium text-slate-800 leading-none">{a.name}</span>
      <span className={cn(
        'text-2xs px-1.5 py-0.5 rounded-full font-medium leading-none',
        RESPONSE_STYLE[a.response] ?? RESPONSE_STYLE.none,
      )}>
        {RESPONSE_LABEL[a.response] ?? '—'}
      </span>
    </div>
  );

  const handleLoadSummary = async () => {
    if (summaryHtml) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch(`/api/meetings/${meeting.meetingId}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId, transcriptId: meeting.transcriptId }),
      });
      const d = await res.json() as { summary?: string; error?: string };
      if (!res.ok || d.error) throw new Error(d.error || 'Помилка');
      setSummaryHtml(d.summary ?? '');
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleLoadTranscript = async () => {
    if (transcriptLoaded) return;
    setTranscriptLoading(true);
    setTranscriptError(null);
    try {
      const params = new URLSearchParams({ transcriptId: meeting.transcriptId! });
      const res = await fetch(`/api/meetings/${meeting.meetingId}/transcript?${params}`);
      const d = await res.json() as { segments?: TranscriptSegment[]; error?: string };
      if (!res.ok) throw new Error(d.error || 'Помилка');
      setSegments(d.segments ?? []);
      setTranscriptLoaded(true);
    } catch (err) {
      setTranscriptError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setTranscriptLoading(false);
    }
  };

  return (
    <GradientDetailCard
      modeLabel="Нарада"
      isEditing={false}
      canEdit={false}
      gradientClassName="from-violet-500/90 to-indigo-700/90"
      cardClassName="max-w-none"
      headerIcon={<Video />}
      headerContent={
        <div className="min-w-0">
          <p className="text-base sm:text-lg font-bold text-white leading-snug">{meeting.subject}</p>
          <p className="text-xs text-white/70 capitalize mt-0.5">{formatDateFull(meeting.startDateTime)}</p>
        </div>
      }
    >
      {/* ── Деталі ── */}
      <DetailSection title="Деталі" colorScheme="indigo" titleIcon={<Calendar />}>
        <div className="space-y-2 mt-1">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
            <span className="text-sm text-slate-700">
              {formatTime(meeting.startDateTime)}–{formatTime(meeting.endDateTime)}
              <span className="text-slate-400 mx-1.5">·</span>
              {meeting.durationMin} хв
            </span>
          </div>
          <div className="flex items-center gap-2">
            {meeting.hasTranscript ? (
              <>
                <FileText className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-emerald-700 font-medium">Транскрипт доступний</span>
              </>
            ) : (
              <>
                <FileText className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-slate-400 italic">Транскрипт недоступний</span>
              </>
            )}
          </div>
          {totalAttendees > 0 && (
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
              <span className="text-sm text-slate-700">{totalAttendees} учасників</span>
              {our.length > 0 && (
                <span className="text-xs text-slate-400">({our.length} наших)</span>
              )}
            </div>
          )}
        </div>
      </DetailSection>

      {/* ── Учасники ── */}
      <DetailSection
        title="Учасники"
        colorScheme="indigo"
        titleIcon={<Users />}
        rightElement={
          totalAttendees > 0 ? (
            <span className="text-2xs text-slate-400 font-normal normal-case tracking-normal">
              {totalAttendees} осіб
            </span>
          ) : undefined
        }
      >
        {totalAttendees === 0 ? (
          <p className="text-xs text-slate-400 mt-1">Список учасників недоступний</p>
        ) : (
          <div className="mt-2 space-y-2.5">
            {our.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Наші</p>
                <div className="flex flex-wrap gap-1.5">
                  {our.map((a, i) => <AttendeeChip key={i} a={a} />)}
                </div>
              </div>
            )}
            {ext.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Зовнішні</p>
                <div className="flex flex-wrap gap-1.5">
                  {ext.map((a, i) => <AttendeeChip key={i} a={a} external />)}
                </div>
              </div>
            )}
          </div>
        )}
      </DetailSection>

      {/* ── Транскрипт + AI Резюме — тільки якщо є транскрипт ── */}
      {meeting.hasTranscript && (
        <>
          {/* Транскрипт */}
          <DetailSection
            title="Транскрипт"
            colorScheme="indigo"
            titleIcon={<MessageSquare />}
            rightElement={
              !transcriptLoaded ? (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleLoadTranscript}
                  disabled={transcriptLoading}
                  aria-label="Завантажити транскрипт нараді"
                  className="gap-1.5"
                >
                  {transcriptLoading
                    ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    : <FileText className="h-3 w-3" aria-hidden="true" />}
                  {transcriptLoading ? 'Завантаження…' : 'Завантажити'}
                </Button>
              ) : segments.length > 0 ? (
                <span className="text-2xs text-slate-400 font-normal normal-case tracking-normal">
                  {segments.length} реплік
                </span>
              ) : undefined
            }
          >
            {transcriptError && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-1">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                {transcriptError}
              </div>
            )}
            {!transcriptLoaded && !transcriptLoading && !transcriptError && (
              <p className="text-xs text-slate-400 mt-1">
                Натисніть «Завантажити» для перегляду тексту нараді
              </p>
            )}
            {transcriptLoaded && segments.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">Транскрипт порожній</p>
            )}
            {transcriptLoaded && segments.length > 0 && (
              <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left text-xs font-semibold text-slate-500 px-3 py-2 w-[28%]">
                        Спікер
                      </th>
                      <th className="text-left text-xs font-semibold text-slate-500 px-3 py-2">
                        Репліка
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {segments.map((seg, i) => (
                      <tr key={i} className="hover:bg-slate-50/80 transition-colors duration-base">
                        <td className="px-3 py-2 text-xs font-semibold text-indigo-600 align-top whitespace-nowrap">
                          {seg.speaker}
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-700 leading-relaxed">
                          {seg.text}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>

          {/* AI Резюме */}
          <DetailSection
            title="AI Резюме"
            colorScheme="indigo"
            titleIcon={<Sparkles />}
            rightElement={
              !summaryHtml ? (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleLoadSummary}
                  disabled={summaryLoading}
                  aria-label="Згенерувати AI резюме нараді"
                  className="gap-1.5"
                >
                  {summaryLoading
                    ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    : <Sparkles className="h-3 w-3" aria-hidden="true" />}
                  {summaryLoading ? 'Аналізую…' : 'Згенерувати'}
                </Button>
              ) : undefined
            }
          >
            {summaryError && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-1">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                {summaryError}
              </div>
            )}
            {summaryHtml ? (
              <div
                className="text-sm text-slate-700 bg-indigo-50/60 rounded-xl px-4 py-3 mt-1 [&_b]:font-semibold [&_ul]:mt-1.5 [&_ul]:space-y-1 [&_li]:ml-4 [&_li]:list-disc"
                dangerouslySetInnerHTML={{ __html: summaryHtml }}
              />
            ) : !summaryLoading && !summaryError ? (
              <p className="text-xs text-slate-400 mt-1">
                Натисніть «Згенерувати» для AI-аналізу нараді
              </p>
            ) : null}
          </DetailSection>
        </>
      )}
    </GradientDetailCard>
  );
}
