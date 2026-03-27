'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { BottomDrawer } from '@/components/ui/BottomDrawer';

/** Стандартная начальная ширина левой панели (px) */
const LEFT_PANEL_DEFAULT_WIDTH = 480;

interface TwoPanelLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;

  /** Включить resize левой панели (default: true) */
  resizable?: boolean;
  /** Начальная ширина левой панели в px (default: 480) */
  initialWidth?: number;
  /** Минимальная ширина при resize (default: 280) */
  minWidth?: number;
  /** Максимальная ширина при resize (default: 600) */
  maxWidth?: number;

  /** Разрешить collapse левой панели (default: false) */
  collapsible?: boolean;
  /** Внешнее управление: свёрнута ли панель */
  collapsed?: boolean;
  /** Callback при toggle collapse */
  onCollapsedChange?: (collapsed: boolean) => void;

  /** Открыт ли BottomDrawer на мобильном */
  isDrawerOpen?: boolean;
  /** Callback закрытия drawer */
  onDrawerClose?: () => void;

  /** Класс контейнера (default: bg-mesh-indigo) */
  containerClassName?: string;
  /** Класс левой панели (default: glass-panel) */
  leftPanelClassName?: string;
  /** Класс правой панели */
  rightPanelClassName?: string;
  /** Класс контента внутри drawer на мобильном */
  mobileDrawerContentClassName?: string;
}

export default function TwoPanelLayout({
  leftPanel,
  rightPanel,
  resizable = true,
  initialWidth = LEFT_PANEL_DEFAULT_WIDTH,
  minWidth = 280,
  maxWidth = 600,
  collapsible = true,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  isDrawerOpen = false,
  onDrawerClose,
  containerClassName,
  leftPanelClassName,
  rightPanelClassName,
  mobileDrawerContentClassName,
}: TwoPanelLayoutProps) {
  const [panelWidth, setPanelWidth] = useState(initialWidth);
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Support both controlled and uncontrolled collapse
  const isCollapsed = controlledCollapsed ?? internalCollapsed;
  const toggleCollapse = useCallback(() => {
    const next = !isCollapsed;
    setInternalCollapsed(next);
    onCollapsedChange?.(next);
  }, [isCollapsed, onCollapsedChange]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const left = panelRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - left;
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setPanelWidth(newWidth);
      }
    },
    [minWidth, maxWidth],
  );

  const handleMouseUp = useCallback(() => {
    isResizingRef.current = false;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleMouseDown = useCallback(() => {
    isResizingRef.current = true;
    setIsResizing(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove, handleMouseUp]);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // ── Mobile ──────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className={cn('flex flex-col h-full', containerClassName)}>
        <div className="flex-1 overflow-hidden glass-panel">
          {leftPanel}
        </div>

        <BottomDrawer
          isOpen={isDrawerOpen}
          onClose={onDrawerClose ?? (() => {})}
          height="full"
          showCloseButton={false}
          showDragHandle={false}
        >
          <div className={cn('min-h-full', mobileDrawerContentClassName)}>
            {rightPanel}
          </div>
        </BottomDrawer>
      </div>
    );
  }

  // ── Desktop ─────────────────────────────────────────────
  const effectiveWidth = isCollapsed ? 0 : (resizable ? panelWidth : initialWidth);

  return (
    <div className={cn('flex h-full bg-mesh-indigo relative', containerClassName)}>
      {/* Left panel */}
      <div
        ref={panelRef}
        className={cn(
          'flex flex-col relative z-10 overflow-hidden glass-panel',
          !isResizing && 'transition-[width] duration-200',
          isCollapsed && 'invisible',
          leftPanelClassName,
        )}
        style={{ width: effectiveWidth }}
      >
        {leftPanel}

        {/* Resizer — transparent strip, drag to resize */}
        {resizable && !isCollapsed && (
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors hover:bg-indigo-300/50 active:bg-indigo-400/50"
            onMouseDown={handleMouseDown}
            aria-label="Змінити ширину панелі"
            role="separator"
            aria-orientation="vertical"
          />
        )}
      </div>

      {/* Collapse toggle — absolute, floats over panel edge, no layout impact */}
      {collapsible && (
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label={isCollapsed ? 'Розгорнути панель' : 'Згорнути панель'}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 w-6 h-12 flex items-center justify-center rounded-full bg-white/60 hover:bg-white/90 text-slate-400 hover:text-slate-600 shadow-sm border border-slate-200/50 transition-colors backdrop-blur-sm"
          style={{ left: effectiveWidth }}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      )}

      {/* Right panel */}
      <div className={cn('flex-1 overflow-y-auto relative z-0', rightPanelClassName)}>
        {rightPanel}
      </div>
    </div>
  );
}
