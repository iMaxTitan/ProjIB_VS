'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { cn } from '@/lib/shared/utils';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: { user_id: string | null; full_name: string | null; status: string | null }[];
  existingUserIds: Set<string>;
  onSubmit: (userIds: string[]) => Promise<void>;
}

export function AddEmployeeModal({
  isOpen,
  onClose,
  employees,
  existingUserIds,
  onSubmit,
}: AddEmployeeModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const available = useMemo(
    () =>
      employees.filter(
        (e) => e.user_id && e.status === 'active' && !existingUserIds.has(e.user_id),
      ),
    [employees, existingUserIds],
  );

  useEffect(() => {
    if (!isOpen) setSelected(new Set());
  }, [isOpen]);

  const toggleEmployee = useCallback((uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    try {
      await onSubmit(Array.from(selected));
      onClose();
    } finally {
      setSaving(false);
    }
  }, [selected, saving, onSubmit, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Добавить сотрудника">
      <div className="space-y-3">
        {available.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">
            Все активные сотрудники уже добавлены
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-1">
            {available.map((emp) => (
              <label
                key={emp.user_id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                  selected.has(emp.user_id!) ? 'bg-indigo-50' : 'hover:bg-slate-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(emp.user_id!)}
                  onChange={() => toggleEmployee(emp.user_id!)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm">{emp.full_name}</span>
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} aria-label="Отмена">
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selected.size === 0 || saving}
            aria-label="Добавить выбранных сотрудников"
          >
            {saving ? <Spinner className="h-4 w-4" /> : `Добавить (${selected.size})`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
