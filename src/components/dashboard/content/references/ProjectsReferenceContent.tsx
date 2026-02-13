'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Folder } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { supabase } from '@/lib/supabase';
import { useProjects } from '@/hooks/useProjects';
import { ProjectWithDepartments } from '@/types/projects';
import { TwoPanelLayout, GradientDetailCard, GroupHeader, DetailSection, ReferenceListItem } from '../shared';
import ReferenceLeftPanelShell from './ReferenceLeftPanelShell';
import ReferenceEmptyState from './ReferenceEmptyState';
import ReferenceDetailsEmptyState from './ReferenceDetailsEmptyState';

export default function ProjectsReferenceContent({ user, tabsSlot }: { user: UserInfo; tabsSlot?: React.ReactNode }) {
  const { projects, loading, error, createProject, updateProject } = useProjects();
  const isMobile = useIsMobile();

  const [selectedProject, setSelectedProject] = useState<ProjectWithDepartments | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [detailsMode, setDetailsMode] = useState<'view' | 'create'>('view');
  const [isEditing, setIsEditing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<'active' | 'inactive', boolean>>({
    active: false,
    inactive: false,
  });
  const [departments, setDepartments] = useState<{ department_id: string; department_name: string }[]>([]);

  const canEdit = user.role === 'chief' || user.role === 'head';

  const [formData, setFormData] = useState({
    project_name: '',
    description: '',
    department_ids: [] as string[],
    is_active: true,
  });

  useEffect(() => {
    const loadDepartments = async () => {
      const { data } = await supabase
        .from('departments')
        .select('department_id, department_name')
        .order('department_name');
      setDepartments(data || []);
    };
    loadDepartments();
  }, []);

  const groupedProjects = useMemo(
    () => ({
      active: projects.filter((project) => project.is_active),
      inactive: projects.filter((project) => !project.is_active),
    }),
    [projects]
  );

  const toggleGroup = (group: 'active' | 'inactive') => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const handleSelectProject = (project: ProjectWithDepartments) => {
    setSelectedProject(project);
    setDetailsMode('view');
    setIsEditing(false);
    if (isMobile) {
      setIsDrawerOpen(true);
    }
  };

  const handleCloseDetails = () => {
    setSelectedProject(null);
    setDetailsMode('view');
    setIsEditing(false);
    setIsDrawerOpen(false);
  };

  const openNewForm = (isActive = true) => {
    setSelectedProject(null);
    setFormData({
      project_name: '',
      description: '',
      department_ids: [],
      is_active: isActive,
    });
    setDetailsMode('create');
    setIsEditing(false);
    if (isMobile) {
      setIsDrawerOpen(true);
    }
  };

  const openEditForm = (project: ProjectWithDepartments) => {
    setSelectedProject(project);
    setFormData({
      project_name: project.project_name,
      description: project.description || '',
      department_ids: project.department_ids || [],
      is_active: project.is_active,
    });
    setIsEditing(true);
    if (isMobile) {
      setIsDrawerOpen(true);
    }
  };

  const handleCreateInline = async () => {
    if (!formData.project_name.trim()) return;
    const result = await createProject({
      project_name: formData.project_name,
      description: formData.description || undefined,
      department_ids: formData.department_ids,
      is_active: formData.is_active,
    });
    if (result.success) {
      setDetailsMode('view');
      setSelectedProject(null);
      setIsDrawerOpen(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedProject || !formData.project_name.trim()) return;
    const result = await updateProject({
      project_id: selectedProject.project_id,
      project_name: formData.project_name,
      description: formData.description || undefined,
      department_ids: formData.department_ids,
      is_active: formData.is_active,
    });
    if (result.success) {
      setIsEditing(false);
    }
  };

  const handleDepartmentToggle = (deptId: string) => {
    setFormData((prev) => ({
      ...prev,
      department_ids: prev.department_ids.includes(deptId)
        ? prev.department_ids.filter((id) => id !== deptId)
        : [...prev.department_ids, deptId],
    }));
  };

  const leftPanel = (
    <ReferenceLeftPanelShell
      tabsSlot={tabsSlot}
      loading={loading}
      error={error}
      isEmpty={projects.length === 0}
      bodyClassName="space-y-2"
      emptyState={<ReferenceEmptyState icon={<Folder className="h-12 w-12" aria-hidden="true" />} text="Проекты не найдены" />}
      body={
        ([
          { key: 'active' as const, label: 'Активные', items: groupedProjects.active },
          { key: 'inactive' as const, label: 'Неактивные', items: groupedProjects.inactive },
        ]).map((group) => (
          <div key={group.key} className="space-y-1.5">
            <GroupHeader
              tone="amber"
              title={group.label}
              count={group.items.length}
              expanded={expandedGroups[group.key]}
              onToggle={() => toggleGroup(group.key)}
              onAdd={canEdit ? () => openNewForm(group.key === 'active') : undefined}
              toggleAriaLabel={`${expandedGroups[group.key] ? 'Свернуть' : 'Развернуть'} группу ${group.label}`}
              addAriaLabel={`Добавить проект в группу ${group.label}`}
            />

            {expandedGroups[group.key] && (
              <div className="space-y-1.5 pl-2">
                {group.items.map((project) => {
                  const isSelected = selectedProject?.project_id === project.project_id;
                  return (
                    <ReferenceListItem
                      key={project.project_id}
                      tone="amber"
                      isSelected={isSelected}
                      onClick={() => handleSelectProject(project)}
                      ariaLabel={`Выбрать ${project.project_name}`}
                      disabled={!project.is_active}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
                            project.is_active ? 'bg-emerald-500' : 'bg-gray-300'
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn('text-sm font-medium truncate', isSelected ? 'text-amber-900' : 'text-slate-800')}>
                              {project.project_name}
                            </span>
                          </div>

                          {project.department_names && project.department_names.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {project.department_names.slice(0, 3).map((name, idx) => (
                                <span key={idx} className="text-2xs px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">
                                  {name}
                                </span>
                              ))}
                              {project.department_names.length > 3 && (
                                <span className="text-2xs text-slate-400">+{project.department_names.length - 3}</span>
                              )}
                            </div>
                          )}
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
          <Folder className="h-4 w-4 text-amber-600" aria-hidden="true" />
          <span className="text-sm">Всего проектов: {projects.length}</span>
        </div>
      }
    />
  );

  const handleCancelCreate = () => handleCloseDetails();

  const handleCancelEdit = () => {
    if (!selectedProject) return;
    setFormData({
      project_name: selectedProject.project_name,
      description: selectedProject.description || '',
      department_ids: selectedProject.department_ids || [],
      is_active: selectedProject.is_active,
    });
    setIsEditing(false);
  };

  const isCreateMode = detailsMode === 'create';
  const editingMode = isEditing || isCreateMode;
  const modeLabel = isCreateMode ? 'Создать' : isEditing ? 'Редактирование' : 'Просмотр';

  const rightPanel = selectedProject || isCreateMode ? (
    <GradientDetailCard
      modeLabel={modeLabel}
      isEditing={editingMode}
      canEdit={canEdit}
      gradientClassName="from-amber-400/80 to-orange-400/80"
      onEdit={selectedProject ? () => openEditForm(selectedProject) : undefined}
      onSave={isCreateMode ? handleCreateInline : handleSaveEdit}
      onCancel={isCreateMode ? handleCancelCreate : handleCancelEdit}
    >
          <DetailSection title="Название" colorScheme="amber">
            {editingMode ? (
              <input
                type="text"
                required
                value={formData.project_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, project_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            ) : (
              <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
                {selectedProject?.project_name}
              </div>
            )}
          </DetailSection>

          <DetailSection title="Описание" colorScheme="amber">
            {editingMode ? (
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                rows={3}
              />
            ) : (
              <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
                {selectedProject?.description || 'Без описания'}
              </div>
            )}
          </DetailSection>

          <DetailSection title="Департаменты" colorScheme="amber">
            {editingMode ? (
              <div className="flex flex-wrap gap-2">
                {departments.map((dept) => {
                  const selected = formData.department_ids.includes(dept.department_id);
                  return (
                    <label
                      key={dept.department_id}
                      className={cn(
                        'inline-flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors',
                        'focus-within:ring-2 focus-within:ring-amber-500',
                        selected ? 'border-amber-300 bg-amber-50' : 'border-slate-200 hover:bg-slate-50 bg-white/60'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => handleDepartmentToggle(dept.department_id)}
                        className="sr-only"
                      />
                      <span className={cn('h-2.5 w-2.5 rounded-full', selected ? 'bg-emerald-500' : 'bg-slate-300')} aria-hidden="true" />
                      <span className={cn('text-sm font-medium whitespace-nowrap', selected ? 'text-amber-700' : 'text-slate-700')}>
                        {dept.department_name}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <>
                {selectedProject?.department_names && selectedProject.department_names.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedProject.department_names.map((name, idx) => (
                      <span key={idx} className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl text-sm font-medium border border-amber-100">
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 bg-white/60 rounded-xl border border-gray-100 p-3">Не назначены</div>
                )}
              </>
            )}
          </DetailSection>

          <DetailSection title="Статус" colorScheme="amber">
            {editingMode ? (
              <div className="grid grid-cols-1">
                <label
                  className={cn(
                    'flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors',
                    'focus-within:ring-2 focus-within:ring-amber-500',
                    formData.is_active ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50 bg-white/60'
                  )}
                >
                  <input
                    type="checkbox"
                    name="project-status"
                    checked={formData.is_active}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                    className="sr-only"
                  />
                  <span className={cn('h-2.5 w-2.5 rounded-full', formData.is_active ? 'bg-emerald-500' : 'bg-slate-400')} aria-hidden="true" />
                  <span className={cn('text-sm font-medium', formData.is_active ? 'text-emerald-700' : 'text-slate-700')}>
                    {formData.is_active ? 'Активный' : 'Неактивный'}
                  </span>
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-gray-100">
                <span className={cn('h-2.5 w-2.5 rounded-full', selectedProject?.is_active ? 'bg-emerald-500' : 'bg-slate-400')} aria-hidden="true" />
                <span className={cn('text-sm font-medium px-2 py-0.5 rounded-full', selectedProject?.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700')}>
                  {selectedProject?.is_active ? 'Активный' : 'Неактивный'}
                </span>
              </div>
            )}
          </DetailSection>

    </GradientDetailCard>
  ) : (
    <ReferenceDetailsEmptyState
      icon={<Folder className="h-16 w-16" aria-hidden="true" />}
      title="Выберите проект"
      description="Нажмите на проект в списке слева для просмотра деталей"
    />
  );

  return (
    <>
      <TwoPanelLayout
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        isDrawerOpen={isDrawerOpen}
        onDrawerClose={handleCloseDetails}
        rightPanelClassName={cn('overscroll-contain', (selectedProject || isCreateMode) ? 'bg-amber-50/30' : 'bg-transparent')}
        resizerClassName="hover:bg-amber-300/50 active:bg-amber-400/50"
      />
    </>
  );
}


