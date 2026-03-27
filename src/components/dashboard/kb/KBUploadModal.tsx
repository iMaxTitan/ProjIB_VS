'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileText, Loader2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface KBCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  categories: KBCategory[];
  onUploadsComplete: (uploadedIds: string[]) => void;
}

export default function KBUploadModal({ isOpen, onClose, categories, onUploadsComplete }: Props) {
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCategoryId, setUploadCategoryId] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    if (!incoming.length) return;
    setUploadFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...incoming.filter(f => !existing.has(f.name))];
    });
    setUploadError('');
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    if (isUploading) return;
    setUploadFiles([]);
    setUploadCategoryId('');
    setUploadError('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!uploadFiles.length || !uploadCategoryId) return;

    setIsUploading(true);
    setUploadError('');
    const uploadedIds: string[] = [];

    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      setUploadProgress({ current: i + 1, total: uploadFiles.length });

      const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title);
      fd.append('category_id', uploadCategoryId);

      try {
        const r = await fetch('/api/kb/documents', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        const json = await r.json();
        if (!r.ok) {
          setUploadError(`«${file.name}»: ${json.error || 'Помилка завантаження'}`);
          setIsUploading(false);
          if (uploadedIds.length) onUploadsComplete(uploadedIds);
          return;
        }
        uploadedIds.push(json.documentId as string);
      } catch {
        setUploadError(`«${file.name}»: мережева помилка`);
        setIsUploading(false);
        if (uploadedIds.length) onUploadsComplete(uploadedIds);
        return;
      }
    }

    setIsUploading(false);
    setUploadFiles([]);
    setUploadCategoryId('');
    setUploadError('');
    onUploadsComplete(uploadedIds);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Завантажити документи">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* File picker */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Файли <span className="text-red-400">*</span>
          </label>

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={isUploading ? -1 : 0}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onKeyDown={e => {
              if (!isUploading && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            aria-label="Обрати файли для завантаження"
            className={cn(
              'rounded-lg border-2 border-dashed p-4 text-center',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500',
              isUploading
                ? 'opacity-50 cursor-not-allowed border-slate-200'
                : 'cursor-pointer border-slate-200 hover:border-indigo-300 hover:bg-slate-50',
              uploadFiles.length > 0 && !isUploading && 'border-indigo-300',
            )}
          >
            <Upload className="h-5 w-5 mx-auto mb-1 text-slate-400" aria-hidden="true" />
            <p className="text-sm text-slate-400">Натисніть щоб обрати файли</p>
            <p className="text-xs text-slate-300 mt-0.5">
              DOCX (Word) або MD (Markdown) · Можна вибрати декілька
            </p>
          </div>

          {/* Selected files list */}
          {uploadFiles.length > 0 && (
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto pr-0.5">
              {uploadFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100"
                >
                  <FileText className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-xs text-indigo-700 truncate">{f.name}</span>
                  {!isUploading && (
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      aria-label={`Прибрати файл ${f.name}`}
                      className="flex-shrink-0 text-slate-300 hover:text-red-400 transition-colors duration-100"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/markdown,.md"
            onChange={handleFileChange}
            className="sr-only"
            aria-hidden="true"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="kb-category">
            Категорія <span className="text-red-400">*</span>
          </label>
          <select
            id="kb-category"
            value={uploadCategoryId}
            onChange={e => setUploadCategoryId(e.target.value)}
            disabled={isUploading}
            className={cn(
              'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            )}
          >
            <option value="">Оберіть категорію…</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Error */}
        {uploadError && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="break-all">{uploadError}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
            aria-label="Скасувати завантаження"
          >
            Скасувати
          </Button>
          <Button
            type="submit"
            disabled={isUploading || !uploadFiles.length || !uploadCategoryId}
            aria-label="Завантажити файли до бази знань"
            className="gap-2 min-w-[140px]"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {uploadProgress.total > 1
                  ? `${uploadProgress.current} з ${uploadProgress.total}…`
                  : 'Завантаження…'}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden="true" />
                {uploadFiles.length > 1
                  ? `Завантажити (${uploadFiles.length})`
                  : 'Завантажити'}
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
