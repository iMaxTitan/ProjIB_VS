'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Star, Sparkles, Save, Loader2, BookOpen, Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import AITextCleanup from '@/components/ui/AITextCleanup';
import { cn } from '@/lib/shared/utils';
import logger from '@/lib/shared/logger';
import type { ProcedureInCompanyReport } from '@/lib/ops';

interface EtalonItem {
  id: string;
  content: string;
}

interface ProcedureNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  procedure: ProcedureInCompanyReport;
  companyId: string;
  year: number;
  month: number;
  onNoteSaved: (procedureId: string, note: string) => void;
}

export default function ProcedureNoteModal({
  isOpen,
  onClose,
  procedure,
  companyId,
  year,
  month,
  onNoteSaved,
}: ProcedureNoteModalProps) {
  const [noteText, setNoteText] = useState('');
  const [etalons, setEtalons] = useState<EtalonItem[]>([]);
  const [etalonsLoading, setEtalonsLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingEtalon, setSavingEtalon] = useState(false);
  const [etalonSaved, setEtalonSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Pre-fill textarea with current note when modal opens
  useEffect(() => {
    if (isOpen) {
      setNoteText(procedure.note || '');
      setError(null);
      setEtalonSaved(false);
    }
  }, [isOpen, procedure.note]);

  // Fetch etalons when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const load = async () => {
      setEtalonsLoading(true);
      try {
        const res = await fetch(
          `/api/ai/embeddings?procedure_id=${procedure.procedure_id}&category=company_report_note&limit=5`,
          { credentials: 'include', signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setEtalons(data);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        logger.warn('[ProcedureNoteModal] Failed to load etalons:', err);
      } finally {
        if (!controller.signal.aborted) setEtalonsLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [isOpen, procedure.procedure_id]);

  // Generate from tasks via existing API
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/reports/company-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          company_id: companyId,
          procedure_ids: [procedure.procedure_id],
          year,
          month,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const generatedNote = data.notes?.[procedure.procedure_id];
      if (generatedNote) {
        setNoteText(generatedNote);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка генерації';
      setError(msg);
      logger.error('[ProcedureNoteModal] Generate error:', err);
    } finally {
      setGenerating(false);
    }
  };

  // Save note via PUT
  const handleSave = async () => {
    const trimmed = noteText.trim();
    if (trimmed.length < 5) {
      setError('Мінімум 5 символів');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/reports/company-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          company_id: companyId,
          procedure_id: procedure.procedure_id,
          year,
          month,
          note: trimmed,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      onNoteSaved(procedure.procedure_id, trimmed);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка збереження';
      setError(msg);
      logger.error('[ProcedureNoteModal] Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Save current text as etalon
  const handleSaveAsEtalon = async () => {
    const trimmed = noteText.trim();
    if (trimmed.length < 10) {
      setError('Мінімум 10 символів для еталону');
      return;
    }

    setSavingEtalon(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          content: trimmed,
          category: 'company_report_note',
          procedure_id: procedure.procedure_id,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const created: EtalonItem = await res.json();
      setEtalons(prev => [created, ...prev]);
      setEtalonSaved(true);
      setTimeout(() => setEtalonSaved(false), 3_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка збереження еталону';
      setError(msg);
      logger.error('[ProcedureNoteModal] Save etalon error:', err);
    } finally {
      setSavingEtalon(false);
    }
  };

  const isProcessing = generating || saving || savingEtalon;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={procedure.procedure_name || 'Примітка'}
      maxWidth="max-w-4xl"
      headerVariant="gradient-indigo"
    >
      <div className="space-y-4">
        {/* Etalon suggestions */}
        {etalonsLoading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            Завантаження еталонів...
          </div>
        ) : etalons.length > 0 ? (
          <div>
            <p className="text-2xs font-bold text-amber-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Star className="w-3 h-3" aria-hidden="true" />
              Еталони примітків
            </p>
            <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
              {etalons.map((etalon) => (
                <button
                  key={etalon.id}
                  type="button"
                  title={etalon.content}
                  onClick={() => {
                    setNoteText(etalon.content);
                    if (error) setError(null);
                  }}
                  disabled={isProcessing}
                  aria-label={`Використати еталон: ${etalon.content.slice(0, 40)}...`}
                  className={cn(
                    'w-full flex items-start gap-2 px-3 py-2 text-xs text-left',
                    'bg-amber-50 text-amber-800 border border-amber-200',
                    'rounded-lg hover:bg-amber-100 hover:border-amber-300',
                    'transition-colors duration-150',
                    'focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <Star className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-400" aria-hidden="true" />
                  <span className="line-clamp-2">{etalon.content}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Textarea */}
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">
            Текст примітки
          </label>
          <textarea
            value={noteText}
            onChange={(e) => {
              setNoteText(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Введіть або згенеруйте примітку для звіту..."
            rows={10}
            maxLength={3000}
            disabled={isProcessing}
            aria-label="Текст примітки для звіту"
            className={cn(
              'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm',
              'placeholder:text-slate-400 resize-none',
              'focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 focus:outline-none',
              'transition-colors duration-150',
              'disabled:opacity-50 disabled:bg-slate-50'
            )}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <AITextCleanup
            text={noteText}
            onResult={setNoteText}
            category="company_report_note"
            procedureId={procedure.procedure_id}
            procedureName={procedure.procedure_name}
            disabled={isProcessing}
          />

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isProcessing}
            aria-label="Згенерувати примітку з задач"
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg',
              'bg-indigo-100 text-indigo-700 border border-indigo-200',
              'hover:bg-indigo-200 hover:border-indigo-300',
              'active:scale-95',
              'focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-[transform,background-color] duration-150'
            )}
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {generating ? 'Генерація...' : 'З задач'}
          </button>

          <button
            type="button"
            onClick={handleSaveAsEtalon}
            disabled={isProcessing || !noteText.trim() || noteText.trim().length < 10}
            aria-label="Зберегти як еталон"
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg',
              'bg-amber-50 text-amber-700 border border-amber-200',
              'hover:bg-amber-100 hover:border-amber-300',
              'active:scale-95',
              'focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-[transform,background-color] duration-150'
            )}
          >
            {savingEtalon ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : etalonSaved ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
            ) : (
              <Star className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {etalonSaved ? 'Збережено' : 'В еталони'}
          </button>

          <div className="flex-1" />

          <button
            type="button"
            onClick={handleSave}
            disabled={isProcessing || !noteText.trim()}
            aria-label="Зберегти примітку"
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg',
              'bg-emerald-600 text-white',
              'hover:bg-emerald-700',
              'active:scale-95',
              'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-[transform,background-color] duration-150'
            )}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            Зберегти
          </button>
        </div>
      </div>
    </Modal>
  );
}
