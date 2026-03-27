'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Clock, Users, FileText, MessageSquare,
  Sparkles, Loader2, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Spinner } from '@/components/ui/Spinner';
import type { CalendarEntry } from '@/lib/ops/planner/calendar-entries';
import type { MeetingInfo, MeetingAttendee, TranscriptSegment } from '@/lib/ops/graph/meetings';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  entry: CalendarEntry | null;
  onClose: () => void;
  onSummaryGenerated: (entryId: string, summary: string) => void;
  onTranscriptConfirmed?: (entryId: string) => void;
}

type MeetingInfoWithSummary = MeetingInfo & { cachedSummary: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeRange(startTime: string, durationMin: number): string {
  const [h, m] = (startTime || '00:00').split(':').map(Number);
  const totalEnd = h * 60 + m + durationMin;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}–${pad(Math.floor(totalEnd / 60) % 24)}:${pad(totalEnd % 60)}`;
}

const RESPONSE_STYLE: Record<string, string> = {
  organizer: 'bg-indigo-500/[0.08] text-indigo-600 border-indigo-500/20',
  accepted: 'bg-emerald-500/[0.08] text-emerald-600 border-emerald-500/20',
  declined: 'bg-red-500/[0.08] text-red-500 border-red-500/20',
  tentativelyAccepted: 'bg-amber-500/[0.08] text-amber-600 border-amber-500/20',
  notResponded: 'bg-slate-500/[0.08] text-slate-500 border-slate-500/20',
  none: 'bg-slate-500/[0.08] text-slate-400 border-slate-400/20',
};

const RESPONSE_LABEL: Record<string, string> = {
  organizer: 'Організатор',
  accepted: 'Прийнято',
  declined: 'Відхилено',
  tentativelyAccepted: 'Можливо',
  notResponded: 'Не відповів',
  none: '—',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalendarMeetingModal({ entry, onClose, onSummaryGenerated, onTranscriptConfirmed }: Props) {
  const [info, setInfo] = useState<MeetingInfoWithSummary | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [summaryHtml, setSummaryHtml] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptLoaded, setTranscriptLoaded] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  const lastEntryId = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch meeting details when entry changes
  useEffect(() => {
    if (!entry?.outlook_event_id) { setInfo(null); return; }
    if (entry.id === lastEntryId.current && info) return;
    lastEntryId.current = entry.id;

    setInfo(null);
    setInfoError(null);
    setSummaryHtml(entry.transcript_summary ?? null);
    setSummaryError(null);
    setSegments([]);
    setTranscriptLoaded(false);
    setTranscriptError(null);

    setInfoLoading(true);
    fetch('/api/planner/meetings/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id }),
    })
      .then(res => res.json())
      .then((data: MeetingInfoWithSummary & { error?: string }) => {
        if (data.error) { setInfoError(data.error); return; }
        setInfo(data);
        if (data.cachedSummary) setSummaryHtml(data.cachedSummary);
        if (data.hasTranscript && entry && onTranscriptConfirmed) onTranscriptConfirmed(entry.id);
      })
      .catch(() => setInfoError('Помилка мережі'))
      .finally(() => setInfoLoading(false));
  }, [entry?.id, entry?.outlook_event_id, entry?.transcript_summary]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape
  useEffect(() => {
    if (!entry) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [entry, onClose]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
  }, [onClose]);

  const handleLoadTranscript = useCallback(async () => {
    if (!info || transcriptLoaded || !info.transcriptId) return;
    setTranscriptLoading(true);
    setTranscriptError(null);
    try {
      const params = new URLSearchParams({ transcriptId: info.transcriptId });
      const res = await fetch(`/api/meetings/${info.meetingId}/transcript?${params}`);
      const d = await res.json() as { segments?: TranscriptSegment[]; error?: string };
      if (!res.ok) throw new Error(d.error || 'Помилка');
      setSegments(d.segments ?? []);
      setTranscriptLoaded(true);
    } catch (err) {
      setTranscriptError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setTranscriptLoading(false);
    }
  }, [info, transcriptLoaded]);

  const handleLoadSummary = useCallback(async () => {
    if (!entry || summaryHtml) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch('/api/planner/meetings/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: entry.id }),
      });
      const d = await res.json() as { summary?: string; error?: string };
      if (!res.ok || d.error) throw new Error(d.error || 'Помилка');
      setSummaryHtml(d.summary ?? '');
      onSummaryGenerated(entry.id, d.summary ?? '');
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSummaryLoading(false);
    }
  }, [entry, summaryHtml, onSummaryGenerated]);

  if (!entry) return null;

  const hasTranscript = info?.hasTranscript ?? entry.has_transcript;
  const timeRange = formatTimeRange(entry.start_time, entry.duration_minutes);
  const required = info?.attendees.filter(a => a.response === 'organizer' || a.type === 'required') ?? [];
  const optional = info?.attendees.filter(a => a.type === 'optional' || a.type === 'resource') ?? [];
  const totalAttendees = info?.attendees.length ?? 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/[0.18] backdrop-blur-[4px]"
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        className="rounded-2xl w-full max-w-lg mx-4 shadow-xl border border-slate-200/60"
        style={{ maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', background: '#fff' }}
      >
        {/* ── Header ── */}
        <div className="detail-hdr" style={{ padding: '8px 14px' }}>
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-[18px] rounded-sm bg-sky-500 flex-shrink-0" />
            <span className="text-[13px] font-semibold text-slate-800 flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {entry.subject || entry.procedure_name || 'Зустріч'}
            </span>
            <span className="text-[10px] text-slate-400 flex-shrink-0">
              {timeRange} · {entry.duration_minutes} хв
            </span>
            <button className="cal-action-btn" onClick={onClose} aria-label="Закрити" type="button">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="hdr-sep" />

        {/* ── Info bar: transcript + attendees ── */}
        <div className="px-3.5 py-2 flex-shrink-0 flex items-center gap-3 border-b border-slate-200/30 bg-slate-50/30">
          <div className="flex items-center gap-1.5">
            {hasTranscript ? (
              <>
                <FileText className="h-3 w-3 text-emerald-500" />
                <span className="text-[11px] font-medium text-emerald-600">Транскрипт</span>
              </>
            ) : (
              <>
                <FileText className="h-3 w-3 text-slate-300" />
                <span className="text-[11px] text-slate-400">Без транскрипту</span>
              </>
            )}
          </div>
          {totalAttendees > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-slate-400" />
              <span className="text-[11px] text-slate-500">{totalAttendees} осіб</span>
            </div>
          )}
          {infoLoading && (
            <Spinner size="xs" />
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>

          {/* Error */}
          {infoError && (
            <div className="flex items-center gap-2 text-[11px] text-red-500 bg-red-500/[0.06] px-3 py-2 rounded-lg mb-2">
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              {infoError}
            </div>
          )}

          {/* AI Summary section */}
          {hasTranscript && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="sec-label flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> AI Резюме
                </span>
                {!summaryHtml && !summaryLoading && (
                  <button className="cal-action-btn" onClick={handleLoadSummary} type="button" title="Згенерувати">
                    <Sparkles className="h-3.5 w-3.5" />
                  </button>
                )}
                {summaryLoading && (
                  <span className="flex items-center gap-1 text-[10px] text-indigo-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Аналізую…
                  </span>
                )}
              </div>
              {summaryError && (
                <div className="flex items-center gap-2 text-[11px] text-red-500 bg-red-500/[0.06] px-3 py-1.5 rounded-lg">
                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                  {summaryError}
                </div>
              )}
              {summaryHtml ? (
                <div
                  className="text-[12px] text-slate-700 leading-relaxed bg-indigo-500/[0.04] rounded-xl px-3.5 py-2.5 border border-indigo-500/10 [&_b]:font-semibold [&_ul]:mt-1 [&_ul]:space-y-0.5 [&_li]:ml-4 [&_li]:list-disc"
                  dangerouslySetInnerHTML={{ __html: summaryHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/on\w+\s*=/gi, 'data-blocked=') }}
                />
              ) : !summaryLoading && !summaryError ? (
                <p className="text-[11px] text-slate-400">Натисніть ✨ для AI-аналізу</p>
              ) : null}
            </div>
          )}

          {/* Attendees */}
          {info && totalAttendees > 0 && (
            <div className="mb-3">
              <span className="sec-label flex items-center gap-1 mb-1.5">
                <Users className="h-3 w-3" /> Учасники
              </span>
              {required.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {required.map((a) => (
                    <span key={a.email || a.name}
                      className={cn('text-[10px] font-medium py-0.5 px-1.5 rounded-[5px] border', RESPONSE_STYLE[a.response] ?? RESPONSE_STYLE.none)}>
                      {a.name}
                    </span>
                  ))}
                </div>
              )}
              {optional.length > 0 && (
                <>
                  <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Необов&apos;язкові</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {optional.map((a) => (
                      <span key={a.email || a.name}
                        className={cn('text-[10px] font-medium py-0.5 px-1.5 rounded-[5px] border', RESPONSE_STYLE[a.response] ?? RESPONSE_STYLE.none)}>
                        {a.name}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Transcript */}
          {hasTranscript && info && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="sec-label flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> Транскрипт
                  {transcriptLoaded && segments.length > 0 && (
                    <span className="text-[10px] text-slate-400 font-normal ml-1">{segments.length} реплік</span>
                  )}
                </span>
                {!transcriptLoaded && (
                  <button className="cal-action-btn" onClick={handleLoadTranscript} disabled={transcriptLoading} type="button" title="Завантажити">
                    {transcriptLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
              {transcriptError && (
                <div className="flex items-center gap-2 text-[11px] text-red-500 bg-red-500/[0.06] px-3 py-1.5 rounded-lg">
                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                  {transcriptError}
                </div>
              )}
              {!transcriptLoaded && !transcriptLoading && !transcriptError && (
                <p className="text-[11px] text-slate-400">Натисніть 📄 для перегляду</p>
              )}
              {transcriptLoaded && segments.length === 0 && (
                <p className="text-[11px] text-slate-400">Транскрипт порожній</p>
              )}
              {transcriptLoaded && segments.length > 0 && (
                <div className="rounded-xl overflow-hidden max-h-64 overflow-y-auto custom-scroll border border-slate-200/60">
                  {segments.map((seg, i) => (
                    <div key={i} className="task-row hover:bg-slate-50/50" style={{ padding: '4px 10px' }}>
                      <span className="text-[10px] font-semibold text-indigo-600 flex-shrink-0" style={{ minWidth: 80 }}>{seg.speaker}</span>
                      <span className="text-[11px] text-slate-700 leading-relaxed flex-1">{seg.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
