import React, { createContext, useContext, useState, ReactNode } from 'react';
import { PlanStatus } from '@/types/planning';

// Тип для представления планов
export type PlanView = 'yearly' | 'quarterly';

// Интерфейс для контекста планов
interface PlansContextType {
  // Текущее представление (годовые, квартальные)
  activeView: PlanView;
  setActiveView: (view: PlanView) => void;
  
  // Выбранные планы
  selectedAnnualPlan: string | null;
  setSelectedAnnualPlan: (planId: string | null) => void;
  
  selectedQuarterlyPlan: string | null;
  setSelectedQuarterlyPlan: (planId: string | null) => void;
  
  // Фильтр статуса
  statusFilter: PlanStatus | null;
  setStatusFilter: (status: PlanStatus | null) => void;
}

// Создаем контекст с начальными значениями
const PlansContext = createContext<PlansContextType>({
  activeView: 'yearly',
  setActiveView: () => {},
  selectedAnnualPlan: null,
  setSelectedAnnualPlan: () => {},
  selectedQuarterlyPlan: null,
  setSelectedQuarterlyPlan: () => {},
  statusFilter: null,
  setStatusFilter: () => {},
});

// Провайдер контекста
export const PlansProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeView, setActiveView] = useState<PlanView>('yearly');
  const [selectedAnnualPlan, setSelectedAnnualPlan] = useState<string | null>(null);
  const [selectedQuarterlyPlan, setSelectedQuarterlyPlan] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PlanStatus | null>(null);

  return (
    <PlansContext.Provider
      value={{
        activeView,
        setActiveView,
        selectedAnnualPlan,
        setSelectedAnnualPlan,
        selectedQuarterlyPlan,
        setSelectedQuarterlyPlan,
        statusFilter,
        setStatusFilter,
      }}
    >
      {children}
    </PlansContext.Provider>
  );
};

// Хук для использования контекста планов
export const usePlansContext = () => useContext(PlansContext);
