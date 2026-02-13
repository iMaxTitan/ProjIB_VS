'use client';

import React, { useState } from 'react';
import { Check, Copy, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GradientDetailCardProps {
  /** Текст бейджа режима: 'Просмотр' | 'Создать' | 'Редактирование' */
  modeLabel: string;
  /** Сейчас в режиме редактирования/создания */
  isEditing: boolean;
  /** Может ли пользователь редактировать */
  canEdit: boolean;
  /** Классы градиента хедера, напр. 'from-amber-400/80 to-orange-400/80' */
  gradientClassName: string;

  /** Перейти в режим редактирования */
  onEdit?: () => void;
  /** Сохранить изменения */
  onSave?: () => void;
  /** Отменить редактирование / создание */
  onCancel?: () => void;
  /** Удалить элемент (кнопка показывается только если передан) */
  onDelete?: () => void;
  /** Закрыть карточку (X в режиме просмотра, только desktop) */
  onClose?: () => void;
  /** Идёт сохранение — Loader2 на кнопке Save, кнопки disabled */
  saving?: boolean;

  /** Заменяет modeLabel badge в хедере. Для планов: icon + statusDropdown + title */
  headerContent?: React.ReactNode;
  /** Копировать (кнопка в view mode, между Edit и Delete) */
  onCopy?: () => void;
  /** Можно ли удалить (default: true). false = кнопка серая с tooltip */
  canDelete?: boolean;
  /** Причина невозможности удаления (tooltip при canDelete=false) */
  deleteReason?: string;
  /** Инлайн подтверждение удаления: "Удалить?" → [✓] [X] */
  deleteConfirm?: boolean;
  /** Дополнительные кнопки в хедере (перед стандартными, view mode) */
  headerActions?: React.ReactNode;
  cardClassName?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export default function GradientDetailCard({
  modeLabel,
  isEditing,
  canEdit,
  gradientClassName,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onClose,
  saving = false,
  headerContent,
  onCopy,
  canDelete = true,
  deleteReason,
  deleteConfirm = false,
  headerActions,
  cardClassName,
  bodyClassName,
  children,
}: GradientDetailCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="p-4">
      <div className={cn('rounded-3xl shadow-glass border border-white/30 glass-card max-md:bg-white max-md:backdrop-blur-none max-md:border-slate-200/50 max-w-3xl animate-scale', cardClassName)}>
        {/* Gradient Header */}
        <div className={cn('p-4 sm:p-5 bg-gradient-to-r text-white backdrop-blur-md rounded-t-3xl relative z-10', gradientClassName)}>
          <div className="flex items-start justify-between gap-4">
            {headerContent ? (
              <div className="min-w-0 flex-1 flex items-center gap-3">
                {headerContent}
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center text-sm px-2.5 py-1 rounded-full font-semibold bg-white/20 text-white backdrop-blur-sm">
                  {modeLabel}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 flex-shrink-0">
              {isEditing ? (
                <>
                  {onCancel && (
                    <button
                      type="button"
                      onClick={onCancel}
                      disabled={saving}
                      aria-label="Отменить"
                      title="Отменить"
                      className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white/80 hover:text-white disabled:opacity-50"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  {onSave && (
                    <button
                      type="button"
                      onClick={onSave}
                      disabled={saving}
                      aria-label="Сохранить"
                      title="Сохранить"
                      className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Закрыть"
                      title="Закрыть"
                      className="hidden md:flex p-2 hover:bg-white/20 rounded-xl transition-colors text-white/80 hover:text-white"
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  )}
                  {headerActions}
                  {canEdit && onEdit && (
                    <button
                      type="button"
                      onClick={onEdit}
                      aria-label="Редактировать"
                      title="Редактировать"
                      className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white/80 hover:text-white"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  {onCopy && (
                    <button
                      type="button"
                      onClick={onCopy}
                      aria-label="Копировать"
                      title="Копировать"
                      className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white/80 hover:text-white"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  {onDelete && (
                    deleteConfirm && showDeleteConfirm ? (
                      <div className="flex items-center gap-1 bg-red-500/30 rounded-xl px-2 py-1 animate-fade-in">
                        <span className="text-2xs font-bold text-white mr-1">Удалить?</span>
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(false)}
                          aria-label="Отмена удаления"
                          title="Отмена"
                          className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { onDelete(); setShowDeleteConfirm(false); }}
                          aria-label="Подтвердить удаление"
                          title="Подтвердить"
                          className="p-1 hover:bg-red-500/50 rounded-lg transition-colors"
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={
                          deleteConfirm
                            ? () => setShowDeleteConfirm(true)
                            : canDelete
                              ? onDelete
                              : () => alert(deleteReason || 'Удаление невозможно')
                        }
                        aria-label={canDelete ? 'Удалить' : deleteReason || 'Удаление невозможно'}
                        title={canDelete ? 'Удалить' : deleteReason || 'Удаление невозможно'}
                        className={cn(
                          'p-2 rounded-xl transition-colors',
                          canDelete
                            ? 'hover:bg-red-500/25 text-white/80 hover:text-white'
                            : 'text-white/40 cursor-not-allowed'
                        )}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className={cn('p-4 sm:p-6 space-y-5 rounded-b-3xl', bodyClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
}
