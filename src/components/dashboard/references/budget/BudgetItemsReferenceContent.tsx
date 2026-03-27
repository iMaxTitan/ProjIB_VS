'use client';

import React, { useState, useMemo } from 'react';
import { Banknote } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { cn } from '@/lib/shared/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useBudgetItems, type BudgetItem } from '@/hooks/useBudgetItems';
import { useProcedures } from '@/hooks/useProcedures';
import { TwoPanelLayout, GradientDetailCard, GroupHeader, DetailSection, ReferenceListItem } from '../../shared';
import ReferenceLeftPanelShell from '../ReferenceLeftPanelShell';
import ReferenceEmptyState from '../ReferenceEmptyState';
import ReferenceDetailsEmptyState from '../ReferenceDetailsEmptyState';
import { Badge } from '@/components/ui/badge';

interface FormData {
  name: string;
  category_id: string;
  process_id: string;
  description: string;
  is_active: boolean;
}

const EMPTY_FORM: FormData = { name: '', category_id: '', process_id: '', description: '', is_active: true };

export default function BudgetItemsReferenceContent({ user, tabsSlot }: { user: UserInfo; tabsSlot?: React.ReactNode }) {
  const { items, categories, isLoading, error, createItem, updateItem } = useBudgetItems();
  const { procedures } = useProcedures();
  const isMobile = useIsMobile();
  const canEdit = user.role === 'chief' || user.role === 'head';

  const [selectedItem, setSelectedItem] = useState<BudgetItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [detailsMode, setDetailsMode] = useState<'view' | 'create'>('view');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<'active' | 'inactive', boolean>>({
    active: true, inactive: false,
  });

  // Processes from procedures (unique)
  const processes = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of procedures) {
      if (p.process_id && p.process_name) map.set(p.process_id, p.process_name);
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [procedures]);

  const grouped = useMemo(() => ({
    active: items.filter(i => i.is_active),
    inactive: items.filter(i => !i.is_active),
  }), [items]);

  const toggleGroup = (g: 'active' | 'inactive') =>
    setExpandedGroups(prev => ({ ...prev, [g]: !prev[g] }));

  const handleSelect = (item: BudgetItem) => {
    setSelectedItem(item);
    setDetailsMode('view');
    setIsEditing(false);
    if (isMobile) setIsDrawerOpen(true);
  };

  const handleClose = () => {
    setSelectedItem(null);
    setDetailsMode('view');
    setIsEditing(false);
    setIsDrawerOpen(false);
  };

  const openCreate = () => {
    setSelectedItem(null);
    setFormData(EMPTY_FORM);
    setDetailsMode('create');
    setIsEditing(false);
    if (isMobile) setIsDrawerOpen(true);
  };

  const openEdit = (item: BudgetItem) => {
    setSelectedItem(item);
    setFormData({
      name: item.name,
      category_id: item.category_id,
      process_id: item.process_id,
      description: item.description || '',
      is_active: item.is_active,
    });
    setIsEditing(true);
    if (isMobile) setIsDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.category_id || !formData.process_id) return;
    setSaving(true);
    try {
      if (detailsMode === 'create') {
        await createItem({
          name: formData.name,
          category_id: formData.category_id,
          process_id: formData.process_id,
          description: formData.description || undefined,
        });
        handleClose();
      } else if (selectedItem) {
        await updateItem({
          id: selectedItem.id,
          name: formData.name,
          category_id: formData.category_id,
          process_id: formData.process_id,
          description: formData.description || undefined,
          is_active: formData.is_active,
        });
        setIsEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (detailsMode === 'create') { handleClose(); return; }
    if (selectedItem) {
      setFormData({
        name: selectedItem.name,
        category_id: selectedItem.category_id,
        process_id: selectedItem.process_id,
        description: selectedItem.description || '',
        is_active: selectedItem.is_active,
      });
    }
    setIsEditing(false);
  };

  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || '—';
  const getProcessName = (id: string) => processes.find(p => p.id === id)?.name || '—';

  // ── Left Panel ──

  const leftPanel = (
    <ReferenceLeftPanelShell
      tabsSlot={tabsSlot}
      loading={isLoading}
      error={error}
      isEmpty={false}
      bodyClassName="space-y-2"
      emptyState={null}
      body={
        ([
          { key: 'active' as const, label: 'Активні', items: grouped.active },
          { key: 'inactive' as const, label: 'Неактивні', items: grouped.inactive },
        ]).map(group => (
          <div key={group.key} className="space-y-1.5">
            <GroupHeader
              tone="emerald"
              title={group.label}
              count={group.items.length}
              expanded={expandedGroups[group.key]}
              onToggle={() => toggleGroup(group.key)}
              onAdd={canEdit && group.key === 'active' ? openCreate : undefined}
              toggleAriaLabel={`${expandedGroups[group.key] ? 'Згорнути' : 'Розгорнути'} ${group.label}`}
              addAriaLabel="Додати бюджетну статтю"
            />
            {expandedGroups[group.key] && (
              <div className="space-y-1.5 pl-2">
                {group.items.map(item => {
                  const isSelected = selectedItem?.id === item.id;
                  return (
                    <ReferenceListItem
                      key={item.id}
                      tone="emerald"
                      isSelected={isSelected}
                      onClick={() => handleSelect(item)}
                      ariaLabel={`Обрати ${item.name}`}
                      disabled={!item.is_active}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-1.5', item.is_active ? 'bg-emerald-500' : 'bg-slate-300')} />
                        <div className="flex-1 min-w-0">
                          <span className={cn('text-sm font-medium truncate block', isSelected ? 'text-emerald-900' : 'text-slate-800')}>
                            {item.name}
                          </span>
                          <div className="flex gap-1 mt-1">
                            <Badge variant="slate" size="sm">{item.budget_categories?.name || '—'}</Badge>
                            <Badge variant="emerald" size="sm">{item.processes?.process_name || '—'}</Badge>
                          </div>
                        </div>
                      </div>
                    </ReferenceListItem>
                  );
                })}
              </div>
            )}
          </div>
        ))
      }
      footer={
        <div className="flex items-center gap-2 text-slate-500">
          <Banknote className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <span className="text-sm">Усього статей: {items.length}</span>
        </div>
      }
    />
  );

  // ── Right Panel ──

  const isCreateMode = detailsMode === 'create';
  const editingMode = isEditing || isCreateMode;
  const modeLabel = isCreateMode ? 'Створити' : isEditing ? 'Редагування' : 'Перегляд';

  const rightPanel = selectedItem || isCreateMode ? (
    <GradientDetailCard
      modeLabel={modeLabel}
      isEditing={editingMode}
      canEdit={canEdit}
      gradientClassName="from-emerald-400/80 to-teal-400/80"
      headerIcon={<Banknote />}
      onEdit={selectedItem ? () => openEdit(selectedItem) : undefined}
      onSave={handleSave}
      onCancel={handleCancel}
      onClose={handleClose}
      saving={saving}
    >
      <DetailSection title="Назва" colorScheme="emerald">
        {editingMode ? (
          <input
            type="text"
            required
            value={formData.name}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="Назва статті"
            aria-label="Назва статті"
          />
        ) : (
          <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
            {selectedItem?.name}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Категорія" colorScheme="emerald">
        {editingMode ? (
          <select
            value={formData.category_id}
            onChange={e => setFormData(prev => ({ ...prev, category_id: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            aria-label="Категорія бюджету"
          >
            <option value="">Оберіть категорію</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (
          <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
            {selectedItem ? getCategoryName(selectedItem.category_id) : '—'}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Процес" colorScheme="emerald">
        {editingMode ? (
          <select
            value={formData.process_id}
            onChange={e => setFormData(prev => ({ ...prev, process_id: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            aria-label="Процес"
          >
            <option value="">Оберіть процес</option>
            {processes.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : (
          <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
            {selectedItem ? getProcessName(selectedItem.process_id) : '—'}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Опис" colorScheme="emerald">
        {editingMode ? (
          <textarea
            value={formData.description}
            onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            rows={3}
            placeholder="Опис статті"
            aria-label="Опис статті"
          />
        ) : (
          <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
            {selectedItem?.description || 'Без опису'}
          </div>
        )}
      </DetailSection>

      {!isCreateMode && (
        <DetailSection title="Статус" colorScheme="emerald">
          {editingMode ? (
            <label
              className={cn(
                'flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors',
                'focus-within:ring-2 focus-within:ring-emerald-500',
                formData.is_active ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50 bg-white/60'
              )}
            >
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={e => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                className="sr-only"
              />
              <span className={cn('h-2.5 w-2.5 rounded-full', formData.is_active ? 'bg-emerald-500' : 'bg-slate-400')} aria-hidden="true" />
              <span className={cn('text-sm font-medium', formData.is_active ? 'text-emerald-700' : 'text-slate-700')}>
                {formData.is_active ? 'Активна' : 'Неактивна'}
              </span>
            </label>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-slate-100">
              <span className={cn('h-2.5 w-2.5 rounded-full', selectedItem?.is_active ? 'bg-emerald-500' : 'bg-slate-400')} aria-hidden="true" />
              <Badge variant={selectedItem?.is_active ? 'emerald' : 'slate'} size="lg">
                {selectedItem?.is_active ? 'Активна' : 'Неактивна'}
              </Badge>
            </div>
          )}
        </DetailSection>
      )}
    </GradientDetailCard>
  ) : (
    <ReferenceDetailsEmptyState
      icon={<Banknote className="h-16 w-16" aria-hidden="true" />}
      title="Оберіть статтю"
      description="Натисніть на статтю у списку зліва для перегляду деталей"
    />
  );

  return (
    <TwoPanelLayout
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      isDrawerOpen={isDrawerOpen}
      onDrawerClose={handleClose}
      rightPanelClassName={cn('overscroll-contain', (selectedItem || isCreateMode) ? 'bg-emerald-50/30' : 'bg-transparent')}
    />
  );
}
