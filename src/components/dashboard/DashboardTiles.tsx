import React, { useState } from 'react';
import AnnualPlanModal from '@/components/planning/AnnualPlanModal';
import QuarterlyPlanModal from '@/components/planning/QuarterlyPlanModal';
import WeeklyPlanModal from '@/components/planning/WeeklyPlanModal';
import { UserInfo } from '@/types/azure';
import { usePlansContext } from '@/context/PlansContext';
import type { PlanView } from '@/context/PlansContext';
import { PlanStatus, PLAN_STATUSES, getPlanStatusColor, getPlanStatusGradient } from '../../types/planning';

interface StatusIndicator {
  tooltip?: string;
  gradient?: string;
  icon?: React.ReactNode;
  customStyle?: string;
  count?: number;
  status?: PlanStatus;
  onClick?: (e: React.MouseEvent) => void;
}

interface TileButton {
  icon?: React.ReactNode;
  label?: string;
  onClick: (e: React.MouseEvent) => void;
  customStyle?: string;
}

interface Tile {
  title: string;
  icon?: React.ReactNode;
  onTileClick?: (e: React.MouseEvent) => void;
  indicators?: StatusIndicator[];
  onIndicatorClick?: (index: number, e: React.MouseEvent) => void;
  button?: TileButton;
}

interface PlanCountsBySection {
  annual: { active: number; submitted: number; draft: number; returned: number };
  quarterly: { active: number; submitted: number; draft: number; returned: number };
  weekly: { active: number; submitted: number; draft: number; returned: number; approved: number; completed: number; failed: number };
}

interface DashboardTilesProps {
  currentPath: string;
  user: UserInfo;
  planCounts: PlanCountsBySection;
  onNavigate?: (path: string) => void;
  onTileClick?: (type: 'yearly' | 'quarterly' | 'weekly') => void;
}

// Универсальный компонент Chip для типов и статусов планов
const Chip: React.FC<{
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  count?: number;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  style?: React.CSSProperties;
}> = ({ label, icon, active, count, onClick, className = '', style }) => (
  <button
    type="button"
    className={`
      flex items-center gap-2 px-4 py-1.5 rounded-full
      text-sm font-medium select-none
      border transition-all duration-200
      relative overflow-hidden
      ${active
        ? 'text-white shadow-md border-indigo-200 backdrop-blur-sm hover:shadow-lg hover:scale-105'
        : 'bg-gray-100 text-gray-700 border-gray-300 hover:shadow-md hover:scale-105'}
      focus:outline-none
      ${className}
    `}
    style={active ? style : undefined}
    onClick={onClick}
  >
    {/* Белый стеклянный оверлей при наведении — теперь для всех чипов */}
    <span className="pointer-events-none absolute inset-0 rounded-full opacity-0 hover:opacity-100 transition-opacity duration-200 bg-white/30 backdrop-blur-sm" />
    {icon && <span className="text-lg relative z-10">{icon}</span>}
    <span className="relative z-10">{label}</span>
    {typeof count === 'number' && (
      <span className="ml-2 bg-white text-indigo-600 rounded-full px-2 py-0.5 text-xs font-bold shadow relative z-10">
        {count}
      </span>
    )}
  </button>
);

const DashboardTiles: React.FC<DashboardTilesProps> = ({
  currentPath,
  user,
  planCounts,
  onNavigate,
  onTileClick
}) => {
  // Track active tile and indicator
  const [activeTile, setActiveTile] = useState<string | null>(null);
  const [activeIndicator, setActiveIndicator] = useState<number | null>(null);

  // States for modals
  const [showAnnualPlanModal, setShowAnnualPlanModal] = useState(false);
  const [showQuarterlyPlanModal, setShowQuarterlyPlanModal] = useState(false);
  const [showWeeklyPlanModal, setShowWeeklyPlanModal] = useState(false);

  // Get context
  const {
    setActiveView, 
    setSelectedAnnualPlan, 
    setSelectedQuarterlyPlan,
    setStatusFilter
  } = usePlansContext();

  const [selectedTile, setSelectedTile] = useState<number>(0); // по умолчанию первая плитка
  const [selectedStatus, setSelectedStatus] = useState<PlanStatus | null>(null);

  const tileToView: PlanView[] = ['yearly', 'quarterly', 'weekly'];

  const handleTileClick = (tileIndex: number) => {
    setSelectedTile(tileIndex);
    setSelectedStatus(null);
    setActiveView(tileToView[tileIndex]);
    setStatusFilter(null);
    setSelectedAnnualPlan(null);
    setSelectedQuarterlyPlan(null);
  };

  const handleIndicatorClick = (tileIndex: number, status: PlanStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTile(tileIndex);
    setSelectedStatus(status);
    setActiveView(tileToView[tileIndex]);
    setStatusFilter(status);
  };

  const handleAddWeeklyPlan = () => {
    setShowWeeklyPlanModal(true);
  };

  const getGradient = (index: number, total: number) => {
    // Создаем более темный градиент в фиолетово-синей гамме
    const startColor = 'from-indigo-600/40';
    const middleColor = 'via-blue-600/30';
    const endColor = 'to-indigo-500/20';
    
    // Для темной темы
    const darkStartColor = 'dark:from-indigo-700/50';
    const darkMiddleColor = 'dark:via-blue-700/40';
    const darkEndColor = 'dark:to-indigo-600/30';
    
    return `bg-gradient-to-br ${startColor} ${middleColor} ${endColor} ${darkStartColor} ${darkMiddleColor} ${darkEndColor}`;
  };

  const getCounts = (section: 'annual' | 'quarterly' | 'weekly') => planCounts[section] || {};

  const tiles: Record<string, Tile[]> = {
    '/dashboard/plans': [
      {
        title: 'Годовые планы',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
        onTileClick: (e) => handleTileClick(0),
        indicators: [
          {
            tooltip: 'Активные планы',
            gradient: getPlanStatusGradient('active'),
            count: getCounts('annual').active ?? 0,
            status: 'active'
          },
          {
            tooltip: 'На утверждение',
            gradient: getPlanStatusGradient('submitted'),
            count: getCounts('annual').submitted ?? 0,
            status: 'submitted'
          },
          {
            tooltip: 'Черновики',
            gradient: getPlanStatusGradient('draft'),
            count: getCounts('annual').draft ?? 0,
            status: 'draft'
          },
          {
            tooltip: 'Создать план',
            gradient: getPlanStatusGradient('draft'),
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            ),
            customStyle: 'bg-white hover:bg-gray-100 border-2 border-indigo-500',
            onClick: () => setShowAnnualPlanModal(true)
          }
        ]
      },
      {
        title: 'Квартальные планы',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
        onTileClick: (e) => handleTileClick(1),
        indicators: [
          {
            tooltip: 'Активные планы',
            gradient: getPlanStatusGradient('active'),
            count: getCounts('quarterly').active ?? 0,
            status: 'active'
          },
          {
            tooltip: 'На утверждение',
            gradient: getPlanStatusGradient('submitted'),
            count: getCounts('quarterly').submitted ?? 0,
            status: 'submitted'
          },
          {
            tooltip: 'Черновики',
            gradient: getPlanStatusGradient('draft'),
            count: getCounts('quarterly').draft ?? 0,
            status: 'draft'
          },
          {
            tooltip: 'Создать план',
            gradient: getPlanStatusGradient('draft'),
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            ),
            customStyle: 'bg-white hover:bg-gray-100 border-2 border-indigo-500',
            onClick: () => setShowQuarterlyPlanModal(true)
          }
        ]
      },
      {
        title: 'Недельные планы',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
        onTileClick: (e) => handleTileClick(2),
        indicators: [
          {
            tooltip: 'Активные',
            gradient: getPlanStatusGradient('active'),
            count: getCounts('weekly').active ?? 0,
            status: 'active'
          },
          {
            tooltip: 'Черновики',
            gradient: getPlanStatusGradient('draft'),
            count: getCounts('weekly').draft ?? 0,
            status: 'draft'
          },
          {
            tooltip: 'Создать план',
            gradient: getPlanStatusGradient('draft'),
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            ),
            customStyle: 'bg-white border border-blue-100 text-blue-500 hover:bg-blue-50',
            onClick: () => setShowWeeklyPlanModal(true)
          }
        ]
      }
    ],
    '/dashboard/tasks': [
      { title: 'Активные задачи', onTileClick: () => {} },
      { title: 'Завершенные задачи', onTileClick: () => {} }
    ],
    '/dashboard/reports': [
      { title: 'Месячные отчеты', onTileClick: () => {} },
      { title: 'Годовые отчеты', onTileClick: () => {} }
    ]
  };

  // Скрываем DashboardTiles для раздела планов (новый интерфейс PlansPageNew)
  // и для других разделов
  if (currentPath === '/dashboard/plans' || !tiles[currentPath]) {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap gap-3 justify-center mt-2 mb-3 items-center">
        {tiles[currentPath]?.map((tile, tileIndex) => {
          const isActive = selectedTile === tileIndex;
          return (
            <button
              key={tile.title}
              type="button"
              className={`
                flex items-center gap-2 px-4 py-1.5 rounded-full
                text-sm font-medium select-none
                border-2 transition-all duration-200
                relative overflow-hidden
                ${isActive
                  ? 'text-white shadow-lg border-indigo-400 backdrop-blur-md hover:shadow-xl hover:scale-105'
                  : 'bg-gray-100 text-gray-700 border-gray-200 hover:shadow-md hover:scale-105'}
                focus:outline-none
              `}
              style={isActive ? {
                background: 'linear-gradient(90deg, rgba(139,92,246,0.7), rgba(59,130,246,0.7))',
                boxShadow: '0 2px 12px 0 rgba(59,130,246,0.18) inset, 0 1px 4px 0 rgba(255,255,255,0.18) inset'
              } : undefined}
              onClick={() => handleTileClick(tileIndex)}
            >
              {/* Белый оверлей при наведении (для всех чипов типов) */}
              <span className="pointer-events-none absolute inset-0 rounded-full opacity-0 hover:opacity-100 transition-opacity duration-200 bg-white/30 backdrop-blur-sm" />
              {tile.icon && <span className="text-lg relative z-10">{tile.icon}</span>}
              <span className="relative z-10">{tile.title.replace(' планы', '').replace('Планы', '')}</span>
            </button>
          );
        })}
        {/* Кнопка "+ Добавить" только для годовых планов и без фильтров */}
        {currentPath === '/dashboard/plans' && selectedTile === 0 && selectedStatus === null && (
          <button
            type="button"
            className="ml-4 px-4 py-2 rounded-full bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700 transition"
            onClick={() => setShowAnnualPlanModal(true)}
            aria-label="Добавить годовой план"
          >
            + Добавить
          </button>
        )}
      </div>

      {/* Показываем только одну строку статусов для выбранного плана */}
      {tiles[currentPath]?.[selectedTile]?.indicators && (
        <div className="flex flex-wrap gap-2 items-center justify-center pb-2 z-10 mt-2">
          {tiles[currentPath][selectedTile].indicators.map((indicator, idx) => {
            const statusMeta = PLAN_STATUSES.find(s => s.value === indicator.status);
            if (!indicator.status) return null;
            const isSelected = selectedStatus === indicator.status;
            return (
              <Chip
                key={idx}
                label={statusMeta?.label || indicator.tooltip || ''}
                icon={indicator.icon}
                active={isSelected}
                style={isSelected ? { background: getPlanStatusGradient(indicator.status) } : undefined}
                count={indicator.count}
                onClick={e => handleIndicatorClick(selectedTile, indicator.status as PlanStatus, e)}
              />
            );
          })}
        </div>
      )}

      {showAnnualPlanModal && (
        <AnnualPlanModal
          isOpen={showAnnualPlanModal}
          onClose={() => setShowAnnualPlanModal(false)}
          onSuccess={() => setShowAnnualPlanModal(false)}
          planToEdit={null}
        />
      )}

      {showQuarterlyPlanModal && (
        <QuarterlyPlanModal
          isOpen={showQuarterlyPlanModal}
          onClose={() => setShowQuarterlyPlanModal(false)}
          onSuccess={() => setShowQuarterlyPlanModal(false)}
          annualPlanId={null}
          planToEdit={null}
        />
      )}

      {showWeeklyPlanModal && (
        <WeeklyPlanModal
          isOpen={showWeeklyPlanModal}
          onClose={() => setShowWeeklyPlanModal(false)}
          onSuccess={() => setShowWeeklyPlanModal(false)}
          user={user}
          quarterlyPlanId={null}
          planToEdit={null}
        />
      )}
    </>
  );
};

export default DashboardTiles;
