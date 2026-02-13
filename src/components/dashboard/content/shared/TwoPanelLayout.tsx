'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  /** Класс resizer-полоски */
  resizerClassName?: string;
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
  isDrawerOpen = false,
  onDrawerClose,
  containerClassName,
  leftPanelClassName,
  rightPanelClassName,
  resizerClassName = 'hover:bg-indigo-300/50 active:bg-indigo-400/50',
  mobileDrawerContentClassName,
}: TwoPanelLayoutProps) {
  const [panelWidth, setPanelWidth] = useState(initialWidth);
  const isResizingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

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
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleMouseDown = useCallback(() => {
    isResizingRef.current = true;
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
  const leftStyle = { width: resizable ? panelWidth : initialWidth };

  return (
    <div className={cn('flex h-full bg-mesh-indigo', containerClassName)}>
      {/* Left panel */}
      <div
        ref={panelRef}
        className={cn(
          'flex flex-col relative z-10 overflow-hidden glass-panel',
          leftPanelClassName,
        )}
        style={leftStyle}
      >
        {leftPanel}

        {/* Resizer */}
        {resizable && (
          <div
            className={cn(
              'absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors group',
              resizerClassName,
            )}
            onMouseDown={handleMouseDown}
            aria-label="Изменить ширину панели"
            role="separator"
            aria-orientation="vertical"
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-6 w-6 text-gray-400/50" aria-hidden="true" />
            </div>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className={cn('flex-1 overflow-y-auto relative z-0', rightPanelClassName)}>
        {rightPanel}
      </div>
    </div>
  );
}
