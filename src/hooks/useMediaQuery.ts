'use client';

import { useState, useEffect } from 'react';

/**
 * SSR-safe хук для отслеживания media queries
 * @param query - CSS media query string (e.g., '(max-width: 767px)')
 * @returns boolean - true если query совпадает
 */
export function useMediaQuery(query: string): boolean {
  // На сервере всегда возвращаем false (desktop-first)
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    // Проверяем поддержку matchMedia
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia(query);

    // Устанавливаем начальное значение
    setMatches(mediaQuery.matches);

    // Слушаем изменения
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Используем addEventListener для современных браузеров
    mediaQuery.addEventListener('change', handler);

    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, [query]);

  return matches;
}

/**
 * Проверка мобильного устройства (< 768px)
 * Совпадает с Tailwind breakpoint md
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

/**
 * Проверка планшета (768px - 1023px)
 */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
}

/**
 * Проверка десктопа (>= 1024px)
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
