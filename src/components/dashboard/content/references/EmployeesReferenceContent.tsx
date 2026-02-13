'use client';

import React, { useState } from 'react';
import { Users } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { SupabaseUserInfo } from '@/types/supabase';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useEmployees } from '@/hooks/useEmployees';
import EmployeeCard from '@/components/employees/EmployeeCard';
import EmployeeDetails from '@/components/employees/EmployeeDetails';
import { TwoPanelLayout, GroupHeader } from '../shared';
import ReferenceLeftPanelShell from './ReferenceLeftPanelShell';
import ReferenceEmptyState from './ReferenceEmptyState';
import ReferenceDetailsEmptyState from './ReferenceDetailsEmptyState';

interface EmployeesReferenceContentProps {
  user: UserInfo;
  tabsSlot?: React.ReactNode;
}

export default function EmployeesReferenceContent({ user, tabsSlot }: EmployeesReferenceContentProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<SupabaseUserInfo | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [detailsMode, setDetailsMode] = useState<'view' | 'create'>('view');
  const [preselectedDepartmentName, setPreselectedDepartmentName] = useState<string | null>(null);

  const isMobile = useIsMobile();

  const {
    loading,
    error,
    employeesByDepartment,
    departments,
    filteredEmployees,
    expandedDepartments,
    toggleDepartment,
    handleEmployeeUpserted,
  } = useEmployees();

  const canEdit = user.role === 'chief' || user.role === 'head';

  const handleSelectEmployee = (employee: SupabaseUserInfo) => {
    setDetailsMode('view');
    setSelectedEmployee(employee);
    if (isMobile) {
      setIsDrawerOpen(true);
    }
  };

  const handleCloseDetails = () => {
    setDetailsMode('view');
    setSelectedEmployee(null);
    setIsDrawerOpen(false);
    setPreselectedDepartmentName(null);
  };

  const handleEmployeeSaved = (employee: SupabaseUserInfo) => {
    handleEmployeeUpserted(employee);
    if (selectedEmployee?.user_id === employee.user_id) {
      setSelectedEmployee(employee);
    }
  };

  const openAddEmployeeModal = (departmentName?: string) => {
    setDetailsMode('create');
    setSelectedEmployee(null);
    setPreselectedDepartmentName(departmentName || null);
    if (isMobile) {
      setIsDrawerOpen(true);
    }
  };

  const leftPanel = (
    <ReferenceLeftPanelShell
      tabsSlot={tabsSlot}
      loading={loading}
      error={error}
      isEmpty={departments.length === 0}
      bodyClassName="space-y-2"
      emptyState={<ReferenceEmptyState icon={<Users className="h-12 w-12" aria-hidden="true" />} text="Сотрудники не найдены" />}
      body={
          departments.map((department) => {
            const deptEmployees = employeesByDepartment[department] || [];
            const isExpanded = expandedDepartments[department] ?? false;

            return (
              <div key={department} className="space-y-1">
                <GroupHeader
                  tone="emerald"
                  title={department}
                  count={deptEmployees.length}
                  expanded={isExpanded}
                  onToggle={() => toggleDepartment(department)}
                  onAdd={canEdit ? () => openAddEmployeeModal(department) : undefined}
                  toggleAriaLabel={`${isExpanded ? 'Свернуть' : 'Развернуть'} отдел ${department}`}
                  addAriaLabel={`Добавить сотрудника в отдел ${department}`}
                />

                {isExpanded && (
                  <div className="space-y-1 pl-2">
                    {deptEmployees.map((employee) => (
                      <EmployeeCard
                        key={employee.user_id}
                        employee={employee}
                        isSelected={selectedEmployee?.user_id === employee.user_id}
                        onClick={() => handleSelectEmployee(employee)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
      }
      footer={
        <div className="flex items-center gap-2 text-slate-500">
          <Users className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <span className="text-sm">Всего сотрудников: {filteredEmployees.length}</span>
        </div>
      }
    />
  );

  const rightPanel = selectedEmployee || detailsMode === 'create' ? (
    <EmployeeDetails
      employee={selectedEmployee}
      mode={detailsMode}
      currentUser={user}
      onClose={handleCloseDetails}
      onSave={handleEmployeeSaved}
      canEdit={canEdit}
      preselectedDepartmentName={preselectedDepartmentName}
    />
  ) : (
    <ReferenceDetailsEmptyState
      icon={<Users className="h-16 w-16" aria-hidden="true" />}
      title="Выберите сотрудника"
      description="Кликните на сотрудника в списке слева для просмотра подробной информации"
    />
  );

  return (
    <TwoPanelLayout
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      isDrawerOpen={isDrawerOpen}
      onDrawerClose={handleCloseDetails}
      rightPanelClassName={cn(
        'overscroll-contain',
        selectedEmployee || detailsMode === 'create' ? 'bg-emerald-50/30' : 'bg-transparent'
      )}
      resizerClassName="hover:bg-emerald-300/50 active:bg-emerald-400/50"
    />
  );
}
