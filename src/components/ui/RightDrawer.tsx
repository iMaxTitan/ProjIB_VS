'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/shared/utils';

interface RightDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Ширина drawer на десктопе */
  width?: 'sm' | 'md' | 'lg';
}

const widthClasses = {
  sm: 'w-full sm:w-96',
  md: 'w-full sm:w-[480px]',
  lg: 'w-full sm:w-[600px]',
};

/**
 * Боковая панель, выезжающая справа.
 * - Плавная анимация открытия/закрытия
 * - ESC и клик по backdrop закрывают панель
 * - Focus trap внутри
 */
export function RightDrawer({
  isOpen,
  onClose,
  title,
  children,
  width = 'md',
}: RightDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // Управление видимостью и анимацией
  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true);
      setIsAnimatingOut(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimatingIn(true);
        });
      });
    } else if (!isOpen && isVisible && !isAnimatingOut) {
      setIsAnimatingIn(false);
      setIsAnimatingOut(true);
    }
  }, [isOpen, isVisible, isAnimatingOut]);

  // Убираем из DOM после анимации закрытия
  useEffect(() => {
    if (isAnimatingOut) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsAnimatingOut(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isAnimatingOut]);

  // Focus trap + ESC
  useEffect(() => {
    if (!isVisible || isAnimatingOut) return;

    previousActiveElement.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';

    const drawerElement = drawerRef.current;
    if (!drawerElement) return;

    const focusableElements = drawerElement.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    setTimeout(() => firstElement?.focus(), 100);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
      previousActiveElement.current?.focus();
    };
  }, [isVisible, isAnimatingOut, onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isVisible) return null;

  const isIn = isAnimatingIn && !isAnimatingOut;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50',
        'transition-[background-color,backdrop-filter] duration-300 ease-out',
        isIn ? 'bg-black/40 backdrop-blur-sm' : 'bg-black/0'
      )}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'right-drawer-title' : undefined}
    >
      <div
        ref={drawerRef}
        className={cn(
          'absolute top-0 right-0 h-full flex flex-col',
          'bg-white shadow-2xl border-l border-slate-200',
          widthClasses[width],
          'transition-transform duration-300 ease-in-out',
          isIn ? 'translate-x-0' : 'translate-x-full'
        )}
        role="document"
      >
        {/* Шапка */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          {title && (
            <h2
              id="right-drawer-title"
              className="text-base font-semibold text-slate-800"
            >
              {title}
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть панель"
            className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors duration-base focus:outline-none focus:ring-2 focus:ring-indigo-500 active:scale-95"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Контент */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}

export default RightDrawer;
