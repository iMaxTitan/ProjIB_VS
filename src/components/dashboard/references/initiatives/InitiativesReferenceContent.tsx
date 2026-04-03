'use client';

import React, { useState, useMemo } from 'react';
import { Lightbulb, Plus } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { UserInfo } from '@/types/azure';
import { TwoPanelLayout, GroupHeader, ReferenceListItem } from '../../shared';
import ReferenceLeftPanelShell from '../ReferenceLeftPanelShell';
import { useInitiatives, useInitiativeMutations, type Initiative } from '@/hooks/useInitiatives';
import { useProcesses } from '@/hooks/useProcesses';
import { Spinner } from '@/components/ui/Spinner';
import { hasRole, ROLE_GROUPS } from '@/lib/shared/auth/role-groups';
import InitiativeRightPanel from './InitiativeRightPanel';

interface ProcessGroup {
  processId: string;
  processName: string;
  initiatives: Initiative[];
}

export default function InitiativesReferenceContent({ user, tabsSlot }: { user: UserInfo; tabsSlot?: React.ReactNode }) {
  const { data: initiatives = [], isLoading } = useInitiatives();
  const { processes } = useProcesses();
  const { create, update, remove } = useInitiativeMutations();
  const canEdit = hasRole(user.role, ROLE_GROUPS.REF_EDITORS);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [expandedProcesses, setExpandedProcesses] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    if (showInactive) return initiatives;
    return initiatives.filter(i => i.is_active);
  }, [initiatives, showInactive]);

  // Build process → initiatives tree (from initiative.process_id)
  const tree = useMemo(() => {
    const processMap = new Map(processes.map(p => [p.process_id, p.process_name]));
    const groups = new Map<string, ProcessGroup>();

    for (const init of filtered) {
      const pid = init.process_id ?? '__none__';
      let group = groups.get(pid);
      if (!group) {
        group = { processId: pid, processName: processMap.get(pid) ?? 'Без процесу', initiatives: [] };
        groups.set(pid, group);
      }
      group.initiatives.push(init);
    }

    return [...groups.values()].sort((a, b) =>
      a.processId === '__none__' ? 1 : b.processId === '__none__' ? -1 : a.processName.localeCompare(b.processName, 'uk'),
    );
  }, [filtered, processes]);

  const selected = useMemo(() => initiatives.find(i => i.id === selectedId) ?? null, [initiatives, selectedId]);

  const handleCreate = async (processId?: string) => {
    const result = await create.mutateAsync({ title: 'Нова ініціатива', department_id: user.department_id, process_id: processId ?? null });
    const newId = (result as unknown as { id: string }[])?.[0]?.id ?? (result as unknown as { id: string })?.id;
    if (newId) setSelectedId(newId);
  };

  const handleSave = async (data: Partial<Initiative>) => {
    if (!selectedId) return;
    await update.mutateAsync({ id: selectedId, ...data });
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    await remove.mutateAsync(selectedId);
    setSelectedId(null);
  };

  const totalCount = filtered.length;

  const leftPanel = (
    <ReferenceLeftPanelShell
      loading={isLoading}
      error={null}
      isEmpty={tree.length === 0}
      bodyClassName="space-y-2"
      emptyState={<div className="flex flex-col items-center justify-center py-12 text-slate-400"><Lightbulb className="h-12 w-12 mb-2" /><span className="text-sm">Немає ініціатив</span></div>}
      body={<>
        <div className="flex items-center justify-between px-1 pb-1">
          <label className="flex items-center gap-1.5 text-[10px] text-slate-500 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}
              className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-500/30 w-3 h-3" />
            Показати неактивні
          </label>
          {canEdit && (
            <button onClick={() => handleCreate()} className="cal-action-btn accent" title="Створити" aria-label="Створити ініціативу">
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {tree.map(group => {
        const isExpanded = expandedProcesses[group.processId] ?? true;
        return (
          <div key={group.processId} className="space-y-1">
            <GroupHeader
              tone="amber"
              title={group.processName}
              count={group.initiatives.length}
              expanded={isExpanded}
              onToggle={() => setExpandedProcesses(prev => ({ ...prev, [group.processId]: !isExpanded }))}
              onAdd={canEdit && group.processId !== '__none__' ? () => handleCreate(group.processId) : undefined}
              toggleAriaLabel={`${isExpanded ? 'Згорнути' : 'Розгорнути'} ${group.processName}`}
              addAriaLabel={`Додати ініціативу в ${group.processName}`}
            />
            {isExpanded && (
              <div className="space-y-1 pl-2">
                {group.initiatives.map(init => (
                  <ReferenceListItem
                    key={init.id}
                    tone="amber"
                    isSelected={selectedId === init.id}
                    onClick={() => setSelectedId(init.id)}
                    ariaLabel={init.title}>
                    <div className="flex items-start gap-2">
                      <Lightbulb className={cn('w-3.5 h-3.5 flex-shrink-0 mt-0.5', init.is_active ? 'text-amber-500' : 'text-slate-300')} />
                      <div className="flex-1 min-w-0">
                        <span className={cn('text-sm font-medium line-clamp-2', selectedId === init.id ? 'text-amber-900' : 'text-slate-800')}>
                          {init.title}
                        </span>
                        {!init.is_active && (
                          <span className="text-2xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 mt-1 inline-block">Неактивна</span>
                        )}
                      </div>
                    </div>
                  </ReferenceListItem>
                ))}
              </div>
            )}
          </div>
        );
      })}</>}
      footer={
        <div className="flex items-center gap-2 text-slate-500">
          <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" />
          <span className="text-sm">Всього ініціатив: {totalCount}</span>
        </div>
      }
    />
  );

  const rightPanel = selected ? (
    <InitiativeRightPanel
      initiative={selected}
      processes={processes as { process_id: string; process_name: string; department_id?: string }[]}
      canEdit={canEdit}
      onSave={handleSave}
      onDelete={handleDelete}
    />
  ) : (
    <div className="flex flex-col items-center justify-center flex-1 text-slate-400 gap-2">
      <Lightbulb className="h-8 w-8 opacity-40" />
      <p className="text-xs">Оберіть ініціативу</p>
    </div>
  );

  return (
    <>
      {tabsSlot}
      <TwoPanelLayout leftPanel={leftPanel} rightPanel={rightPanel} />
    </>
  );
}
