'use client';

import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

interface InitiativeFormProps {
  onSubmit: (title: string, description: string) => void;
  onCancel: () => void;
  saving?: boolean;
  initialTitle?: string;
  initialDescription?: string;
}

export default function InitiativeForm({ onSubmit, onCancel, saving, initialTitle = '', initialDescription = '' }: InitiativeFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit(title.trim(), description.trim());
  };

  return (
    <div className="flex flex-col gap-1.5 mb-2">
      <div className="flex gap-1.5">
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-[11px] focus:ring-2 focus:ring-indigo-500"
          placeholder="Назва ініціативи" aria-label="Назва ініціативи"
          onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        <button onClick={handleSubmit} disabled={saving || !title.trim()} className="cal-action-btn accent" aria-label="Зберегти"><Check className="w-3.5 h-3.5" /></button>
        <button onClick={onCancel} className="cal-action-btn" aria-label="Скасувати"><X className="w-3.5 h-3.5" /></button>
      </div>
      <textarea value={description} onChange={e => setDescription(e.target.value)}
        className="border border-slate-300 rounded-lg px-3 py-1.5 text-[11px] focus:ring-2 focus:ring-indigo-500 resize-none"
        placeholder="Опис ініціативи (необов'язково)" aria-label="Опис ініціативи"
        rows={2} />
    </div>
  );
}
