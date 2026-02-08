'use client';

import React, { useState } from 'react';
import { UserInfo } from '@/types/azure';
import { SupabaseUserInfo } from '@/types/supabase';
import { useEmployees } from '@/hooks/useEmployees';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { Plus, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import EmployeesLayout from '@/components/employees/EmployeesLayout';
import EmployeeCard from '@/components/employees/EmployeeCard';
import EmployeeDetails from '@/components/employees/EmployeeDetails';
import EmployeeFormModal from '@/components/employees/EmployeeFormModal';

interface EmployeesContentProps {
  user: UserInfo;
}

export default function EmployeesContent({ user }: EmployeesContentProps) {
  // State
  const [selectedEmployee, setSelectedEmployee] = useState<SupabaseUserInfo | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const isMobile = useIsMobile();

  // Data
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

  // Права на редактирование
  const canEdit = user.role === 'chief' || user.role === 'head';

  // Handlers
  const handleSelectEmployee = (employee: SupabaseUserInfo) => {
    setSelectedEmployee(employee);
    if (isMobile) {
      setIsDrawerOpen(true);
    }
  };

  const handleCloseDetails = () => {
    setSelectedEmployee(null);
    setIsDrawerOpen(false);
  };

  const handleEmployeeSaved = (employee: SupabaseUserInfo) => {
    handleEmployeeUpserted(employee);
    // Обновляем выбранного сотрудника, если это он
    if (selectedEmployee?.user_id === employee.user_id) {
      setSelectedEmployee(employee);
    }
  };

  // --- Левая панель ---
  const renderLeftPanel = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-100 bg-white/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            <h1 className="text-lg font-bold text-slate-800">Сотрудники</h1>
            <span className="text-sm text-slate-400">({filteredEmployees.length})</span>
          </div>
          {canEdit && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowAddModal(true)}
              aria-label="Добавить сотрудника"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">Добавить</span>
            </Button>
          )}
        </div>
      </div>

      {/* Список сотрудников по отделам */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">
            <p className="text-sm">{error}</p>
          </div>
        ) : departments.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" aria-hidden="true" />
            <p className="text-sm">Сотрудники не найдены</p>
          </div>
        ) : (
          departments.map((department) => {
            const deptEmployees = employeesByDepartment[department] || [];
            const isExpanded = expandedDepartments[department] ?? true;

            return (
              <div key={department} className="space-y-1">
                {/* Заголовок отдела */}
                <button
                  type="button"
                  onClick={() => toggleDepartment(department)}
                  aria-expanded={isExpanded ? 'true' : 'false'}
                  aria-label={`${isExpanded ? 'Свернуть' : 'Развернуть'} отдел ${department}`}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left",
                    "bg-gradient-to-r from-slate-100/80 to-slate-50/80 border border-slate-200/50",
                    "hover:from-slate-200/80 hover:to-slate-100/80",
                    "focus:outline-none focus:ring-2 focus:ring-emerald-500",
                    "transition-all"
                  )}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
                  )}
                  <span className="text-sm font-semibold text-slate-700 flex-1 truncate">
                    {department}
                  </span>
                  <span className="text-xs text-slate-400 bg-white/60 px-2 py-0.5 rounded-full">
                    {deptEmployees.length}
                  </span>
                </button>

                {/* Список сотрудников отдела */}
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
        )}
      </div>
    </div>
  );

  // --- Правая панель ---
  const renderRightPanel = () => {
    if (!selectedEmployee) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
          <Users className="h-16 w-16 mb-4 opacity-30" aria-hidden="true" />
          <p className="text-lg font-medium mb-2">Выберите сотрудника</p>
          <p className="text-sm text-center">
            Кликните на сотрудника в списке слева для просмотра подробной информации
          </p>
        </div>
      );
    }

    return (
      <EmployeeDetails
        employee={selectedEmployee}
        currentUser={user}
        onClose={handleCloseDetails}
        onSave={handleEmployeeSaved}
        canEdit={canEdit}
      />
    );
  };

  return (
    <>
      <EmployeesLayout
        leftPanel={renderLeftPanel()}
        rightPanel={renderRightPanel()}
        hasSelection={!!selectedEmployee}
        isDrawerOpen={isDrawerOpen}
        onDrawerClose={handleCloseDetails}
      />

      {/* Модальное окно добавления нового сотрудника */}
      {showAddModal && (
        <EmployeeFormModal
          currentUser={user}
          onClose={() => setShowAddModal(false)}
          onEmployeeUpserted={handleEmployeeSaved}
        />
      )}
    </>
  );
}
