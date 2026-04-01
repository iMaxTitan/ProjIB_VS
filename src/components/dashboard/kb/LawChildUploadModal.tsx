'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileText, Loader2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const DOC_TYPES = [
  'НПК',
  'Лист',
  'Наказ',
  'Постанова',
  'Інструкція',
  'Методичні рекомендації',
  'Інше',
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  parentDoc: { id: string; title: string } | null;
  onImport: (item: {
    title: string;
    docType: string;
    docNumber: string;
    fileContent: string;
    fileName: string;
  }) => void;
  importing?: boolean;
}

export default function LawChildUploadModal({ isOpen, onClose, parentDoc, onImport, importing }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('НПК');
  const [docNumber, setDocNumber] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!title) {
      setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    }
    setError('');
    e.target.value = '';
  };

  const handleClose = () => {
    if (importing || reading) return;
    setFile(null);
    setTitle('');
    setDocType('НПК');
    setDocNumber('');
    setError('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim() || !docType) return;

    setReading(true);
    setError('');

    try {
      const text = await file.text();
      if (!text.trim()) {
        setError('Файл порожній');
        setReading(false);
        return;
      }

      onImport({
        title: title.trim(),
        docType,
        docNumber: docNumber.trim(),
        fileContent: text,
        fileName: file.name,
      });

      setFile(null);
      setTitle('');
      setDocNumber('');
      setReading(false);
    } catch {
      setError('Не вдалося прочитати файл');
      setReading(false);
    }
  };

  const busy = importing || reading;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Додати дочірній документ">
      <form onSubmit={handleSubmit} className="space-y-4">

        {parentDoc && (
          <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            Батьківський документ: <span className="font-medium text-slate-700">{parentDoc.title}</span>
          </div>
        )}

        {/* File picker */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Файл <span className="text-red-400">*</span>
          </label>
          {file ? (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100">
              <FileText className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" aria-hidden="true" />
              <span className="flex-1 text-xs text-indigo-700 truncate">{file.name}</span>
              {!busy && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  aria-label="Прибрати файл"
                  className="flex-shrink-0 text-slate-300 hover:text-red-400 transition-colors"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              aria-label="Обрати файл"
              className={cn(
                'rounded-lg border-2 border-dashed p-4 text-center cursor-pointer',
                'border-slate-200 hover:border-indigo-300 hover:bg-slate-50',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500',
                'transition-colors',
              )}
            >
              <Upload className="h-5 w-5 mx-auto mb-1 text-slate-400" aria-hidden="true" />
              <p className="text-sm text-slate-400">Markdown (.md) або Word (.docx)</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.docx,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
            className="sr-only"
            aria-hidden="true"
          />
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="child-title">
            Назва <span className="text-red-400">*</span>
          </label>
          <input
            id="child-title"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={busy}
            placeholder="Назва документу"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300"
          />
        </div>

        {/* Doc type + Doc number */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="child-doctype">
              Тип <span className="text-red-400">*</span>
            </label>
            <select
              id="child-doctype"
              value={docType}
              onChange={e => setDocType(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300"
            >
              {DOC_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="child-docnum">
              Номер
            </label>
            <input
              id="child-docnum"
              type="text"
              value={docNumber}
              onChange={e => setDocNumber(e.target.value)}
              disabled={busy}
              placeholder="напр. 2341-14"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={handleClose} disabled={busy} aria-label="Скасувати">
            Скасувати
          </Button>
          <Button
            type="submit"
            disabled={busy || !file || !title.trim()}
            aria-label="Імпортувати документ"
            className="gap-2"
          >
            {busy ? (
              <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Імпорт…</>
            ) : (
              <><Upload className="h-4 w-4" aria-hidden="true" /> Імпортувати</>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
