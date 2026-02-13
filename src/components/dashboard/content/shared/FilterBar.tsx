'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────── */

export interface FilterOption {
  value: string;
  label: string;
  icon?: LucideIcon;
  /** Tailwind color class for a status dot, e.g. 'bg-green-500' */
  dot?: string;
}

export interface FilterConfig {
  id: string;
  label: string;
  value: string | null;
  options: FilterOption[];
  onChange: (value: string | null) => void;
  icon?: LucideIcon;
  /** Show "Все" option and allow clearing to null (default: false) */
  clearable?: boolean;
}

interface FilterBarProps {
  /** Current search text */
  searchQuery?: string;
  /** Callback when search text changes */
  onSearchChange?: (value: string) => void;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Dropdown filter configs */
  filters?: FilterConfig[];
  /** Reset all filters callback */
  onClearAll?: () => void;
  /** Additional class names */
  className?: string;
}

/* ─── SearchInput ────────────────────────────────────────── */

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative flex-1 min-w-[140px] sm:min-w-[200px] sm:max-w-xs">
      <Search
        className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('');
            inputRef.current?.blur();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          'w-full pl-9 pr-8 py-1.5 text-sm rounded-lg border border-slate-200',
          'bg-white/60 placeholder-slate-400 text-slate-700',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300',
          'transition-colors',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          aria-label="Очистить поиск"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* ─── FilterDropdown ─────────────────────────────────────── */

function FilterDropdown({ config }: { config: FilterConfig }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const selectedOption = config.options.find((o) => o.value === config.value);
  const Icon = config.icon;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && isOpen) {
            setIsOpen(false);
            e.stopPropagation();
          }
        }}
        aria-label={`${config.label}: ${selectedOption?.label ?? 'Все'}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border',
          'transition-colors active:scale-95',
          isOpen
            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        )}
      >
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className="truncate max-w-[120px]">
          {selectedOption?.label ?? config.label}
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={config.label}
          className={cn(
            'absolute z-50 top-full left-0 mt-1 min-w-[160px] max-h-[280px] overflow-y-auto',
            'bg-white/95 backdrop-blur-xl border border-slate-200 rounded-xl shadow-lg py-1',
            'scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent',
          )}
        >
          {config.clearable && (
            <button
              type="button"
              role="option"
              aria-selected={config.value === null}
              onClick={() => {
                config.onChange(null);
                setIsOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                config.value === null
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <span className="flex-1">Все</span>
              {config.value === null && (
                <Check className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
              )}
            </button>
          )}

          {config.options.map((option) => {
            const OptionIcon = option.icon;
            const isSelected = config.value === option.value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  config.onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                  isSelected
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-slate-700 hover:bg-slate-50',
                )}
              >
                {option.dot && (
                  <span
                    className={cn('w-2 h-2 rounded-full flex-shrink-0', option.dot)}
                    aria-hidden="true"
                  />
                )}
                {OptionIcon && (
                  <OptionIcon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                )}
                <span className="flex-1 truncate">{option.label}</span>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 text-indigo-600 flex-shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── ActiveFilterChips ──────────────────────────────────── */

function ActiveFilterChips({
  searchQuery,
  onSearchClear,
  filters,
  onClearAll,
}: {
  searchQuery: string;
  onSearchClear: () => void;
  filters: FilterConfig[];
  onClearAll?: () => void;
}) {
  const clearableFilters = filters.filter((f) => f.clearable && f.value !== null);
  const hasSearch = searchQuery.trim().length > 0;

  if (!hasSearch && clearableFilters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {hasSearch && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
          &laquo;{searchQuery.length > 20 ? searchQuery.slice(0, 20) + '\u2026' : searchQuery}&raquo;
          <button
            type="button"
            onClick={onSearchClear}
            aria-label="Убрать поиск"
            className="p-0.5 rounded hover:bg-indigo-100 transition-colors"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      )}

      {clearableFilters.map((f) => {
        const selected = f.options.find((o) => o.value === f.value);
        return (
          <span
            key={f.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-slate-100 text-slate-700 border border-slate-200"
          >
            {f.label}: {selected?.label ?? f.value}
            <button
              type="button"
              onClick={() => f.onChange(null)}
              aria-label={`Убрать фильтр ${f.label}`}
              className="p-0.5 rounded hover:bg-slate-200 transition-colors"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        );
      })}

      {onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline ml-1"
        >
          Очистить все
        </button>
      )}
    </div>
  );
}

/* ─── FilterBar (main) ───────────────────────────────────── */

export default function FilterBar({
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Поиск...',
  filters = [],
  onClearAll,
  className,
}: FilterBarProps) {
  const showSearch = !!onSearchChange;
  const showFilters = filters.length > 0;

  if (!showSearch && !showFilters) return null;

  const hasActiveChips =
    searchQuery.trim().length > 0 ||
    filters.some((f) => f.clearable && f.value !== null);

  return (
    <div
      className={cn(
        'px-3 py-2.5 border-b border-slate-100/80 bg-white/80 backdrop-blur-md',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {showSearch && (
          <SearchInput
            value={searchQuery}
            onChange={onSearchChange!}
            placeholder={searchPlaceholder}
          />
        )}
        {filters.map((filter) => (
          <FilterDropdown key={filter.id} config={filter} />
        ))}
      </div>

      {hasActiveChips && (
        <ActiveFilterChips
          searchQuery={searchQuery}
          onSearchClear={() => onSearchChange?.('')}
          filters={filters}
          onClearAll={onClearAll}
        />
      )}
    </div>
  );
}
