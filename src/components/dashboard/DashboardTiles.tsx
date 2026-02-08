import React, { useState } from 'react';
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
}

interface DashboardTilesProps {
  currentPath: string;
  user: UserInfo;
  planCounts: PlanCountsBySection;
  onNavigate?: (path: string) => void;
  onTileClick?: (type: 'yearly' | 'quarterly') => void;
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
      flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 rounded-full
      text-xs sm:text-sm font-medium select-none
      border transition-all duration-base
      relative overflow-hidden
      ${active
        ? 'text-white shadow-md border-indigo-200 backdrop-blur-sm hover:shadow-lg hover:scale-105'
        : 'bg-gray-100 text-gray-700 border-gray-300 hover:shadow-md hover:scale-105'}
      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
      active:scale-95
      ${className}
    `}
    style={active ? style : undefined}
    onClick={onClick}
    aria-label={`${label}${typeof count === 'number' ? `: ${count}` : ''}`}
  >
    {/* Белый стеклянный оверлей при наведении — теперь для всех чипов */}
    <span className="pointer-events-none absolute inset-0 rounded-full opacity-0 hover:opacity-100 transition-opacity duration-base bg-white/30 backdrop-blur-sm" />
    {icon && <span className="text-base sm:text-lg relative z-10" aria-hidden="true">{icon}</span>}
    <span className="relative z-10 hidden xs:inline">{label}</span>
    <span className="relative z-10 xs:hidden">{label.split(' ')[0]}</span>
    {typeof count === 'number' && (
      <span className="ml-1 sm:ml-2 bg-white text-indigo-600 rounded-full px-1.5 sm:px-2 py-0.5 text-xs font-bold shadow relative z-10">
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

  // Get context
  const {
    setActiveView,
    setSelectedAnnualPlan,
    setSelectedQuarterlyPlan,
    setStatusFilter
  } = usePlansContext();

  const [selectedTile, setSelectedTile] = useState<number>(0); // по умолчанию первая плитка
  const [selectedStatus, setSelectedStatus] = useState<PlanStatus | null>(null);

  const tileToView: PlanView[] = ['yearly', 'quarterly'];

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

  const getCounts = (section: 'annual' | 'quarterly') => planCounts[section] || {};

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
          }
        ]
      },
    ],
    '/dashboard/reports': [
      { title: 'Месячные отчеты', onTileClick: () => { } },
      { title: 'Годовые отчеты', onTileClick: () => { } }
    ]
  };

  // Скрываем DashboardTiles для раздела планов (новый интерфейс PlansPageNew)
  // и для других разделов
  if (currentPath === '/dashboard/plans' || !tiles[currentPath]) {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 sm:gap-3 justify-center mt-2 mb-3 items-center px-2">
        {tiles[currentPath]?.map((tile, tileIndex) => {
          const isActive = selectedTile === tileIndex;
          return (
            <button
              key={tile.title}
              type="button"
              className={`
                flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 rounded-full
                text-xs sm:text-sm font-medium select-none
                border-2 transition-all duration-base
                relative overflow-hidden
                ${isActive
                  ? 'text-white shadow-lg border-indigo-400 backdrop-blur-md hover:shadow-xl hover:scale-105'
                  : 'bg-gray-100 text-gray-700 border-gray-200 hover:shadow-md hover:scale-105'}
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                active:scale-95
              `}
              style={isActive ? {
                background: 'linear-gradient(90deg, rgba(139,92,246,0.7), rgba(59,130,246,0.7))',
                boxShadow: '0 2px 12px 0 rgba(59,130,246,0.18) inset, 0 1px 4px 0 rgba(255,255,255,0.18) inset'
              } : undefined}
              onClick={() => handleTileClick(tileIndex)}
              aria-label={`Выбрать ${tile.title}`}
              aria-current={isActive ? 'true' : undefined}
            >
              {/* Белый оверлей при наведении (для всех чипов типов) */}
              <span className="pointer-events-none absolute inset-0 rounded-full opacity-0 hover:opacity-100 transition-opacity duration-base bg-white/30 backdrop-blur-sm" />
              {tile.icon && <span className="text-base sm:text-lg relative z-10" aria-hidden="true">{tile.icon}</span>}
              <span className="relative z-10 hidden xs:inline">{tile.title.replace(' планы', '').replace('Планы', '')}</span>
              <span className="relative z-10 xs:hidden">{tile.title.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Показываем только одну строку статусов для выбранного плана */}
      {tiles[currentPath]?.[selectedTile]?.indicators && (
        <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center justify-center pb-2 z-10 mt-2 px-2">
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
    </>
  );
};

export default DashboardTiles;
