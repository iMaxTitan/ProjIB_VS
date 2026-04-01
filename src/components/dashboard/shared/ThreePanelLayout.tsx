'use client';

import React, { useState, useCallback, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';

// ── Resizable splitter hook ──

interface UseSplitterOptions {
  initialLeft?: number;
  initialMid?: number;
  /** Min/max for left panel (default 15–35) */
  leftMin?: number;
  leftMax?: number;
  /** Min for center panel (default 25) */
  midMin?: number;
  /** Min/max for right panel (default 15, no max) */
  rightMin?: number;
  rightMax?: number;
}

export function useResizablePanels({
  initialLeft = 25, initialMid = 40,
  leftMin = 15, leftMax = 35,
  midMin = 25, rightMin = 15, rightMax,
}: UseSplitterOptions = {}) {
  const [leftPct, setLeftPct] = useState(initialLeft);
  const [midPct, setMidPct] = useState(initialMid);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSplitterDown = useCallback((which: 'left' | 'right', e: React.PointerEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startLeft = leftPct;
    const startMid = midPct;
    const onMove = (ev: PointerEvent) => {
      const cursorPct = ((ev.clientX - rect.left) / rect.width) * 100;
      if (which === 'left') {
        const newLeft = Math.max(leftMin, Math.min(leftMax, cursorPct));
        const rPct = 100 - newLeft - startMid;
        if (rPct >= rightMin) setLeftPct(newLeft);
      } else {
        const newMid = cursorPct - startLeft;
        const rPct = 100 - startLeft - newMid;
        if (newMid >= midMin && rPct >= rightMin && (!rightMax || rPct <= rightMax)) setMidPct(newMid);
      }
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [leftPct, midPct, leftMin, leftMax, midMin, rightMin, rightMax]);

  return { leftPct, midPct, containerRef, handleSplitterDown };
}

// ── Splitter bar ──

function Splitter({ which, onPointerDown }: {
  which: 'left' | 'right';
  onPointerDown: (which: 'left' | 'right', e: React.PointerEvent) => void;
}) {
  return (
    <div
      className="flex items-center justify-center flex-shrink-0 cursor-col-resize select-none group"
      style={{ width: 8 }}
      onPointerDown={(e) => onPointerDown(which, e)}
    >
      <div className="w-[3px] h-10 rounded-full bg-slate-300/60 group-hover:bg-indigo-400/60 group-active:bg-indigo-500/80 transition-colors" />
    </div>
  );
}

// ── Panel wrapper (glass-panel > element-card) ──

export function PanelCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass-panel rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden p-2 ${className || ''}`}>
      <div className="element-card flex-1 min-h-0 flex flex-col overflow-hidden" style={{ borderRadius: 12 }}>
        {children}
      </div>
    </div>
  );
}

// ── Mobile FAB buttons ──

interface MobileFab {
  id: string;
  label: string;
  icon: LucideIcon;
  variant: 'procs' | 'tasks';
}

// ── Three-panel layout ──

interface ThreePanelLayoutProps {
  /** Filter controls (top of left panel on desktop, top on mobile) */
  filters: React.ReactNode;
  /** Left panel content (inside element-card) */
  leftPanel: React.ReactNode;
  /** Extra content between left panel and filters (e.g. second glass-panel zone) */
  leftExtra?: React.ReactNode;
  /** Center panel content (inside element-card) */
  centerPanel: React.ReactNode;
  /** Right panel content (inside element-card) */
  rightPanel: React.ReactNode;
  /** Mobile FAB config */
  mobileFabs: [MobileFab, MobileFab];
  /** Which mobile panel is open */
  mobilePanel: string | null;
  /** Set mobile panel */
  onMobilePanelChange: (panel: string | null) => void;
  /** Mobile left panel content (may differ from desktop, e.g. different onSelect callbacks) */
  mobileLeftPanel?: React.ReactNode;
  /** Splitter options */
  initialLeft?: number;
  initialMid?: number;
}

export function ThreePanelLayout({
  filters,
  leftPanel,
  leftExtra,
  centerPanel,
  rightPanel,
  mobileFabs,
  mobilePanel,
  onMobilePanelChange,
  mobileLeftPanel,
  initialLeft = 25,
  initialMid = 40,
}: ThreePanelLayoutProps) {
  const { leftPct, midPct, containerRef, handleSplitterDown } = useResizablePanels({ initialLeft, initialMid });

  return (
    <>
      {/* ── Mobile: filters on top ── */}
      <div className="flex lg:hidden mb-2 w-full">
        <div className="flex-1 min-w-0">{filters}</div>
      </div>

      {/* ── Desktop: 3-panel resizable layout ── */}
      <div ref={containerRef} className="hidden lg:flex flex-row h-[calc(100vh-118px)]">
        {/* LEFT */}
        <div className="flex flex-col gap-2 min-w-0 overflow-hidden" style={{ width: `${leftPct}%` }}>
          {filters}
          <PanelCard>{leftPanel}</PanelCard>
          {leftExtra}
        </div>

        <Splitter which="left" onPointerDown={handleSplitterDown} />

        {/* CENTER */}
        <div className="flex flex-col min-w-0 overflow-hidden" style={{ width: `${midPct}%` }}>
          <PanelCard>{centerPanel}</PanelCard>
        </div>

        <Splitter which="right" onPointerDown={handleSplitterDown} />

        {/* RIGHT */}
        <div className="flex flex-col min-w-0 overflow-hidden" style={{ width: `${Math.max(100 - leftPct - midPct, 15)}%` }}>
          <PanelCard>{rightPanel}</PanelCard>
        </div>
      </div>

      {/* ── Mobile: center panel full-width ── */}
      <div className="flex flex-col gap-2 lg:hidden pb-16">
        <div className="glass-panel rounded-xl flex flex-col p-2">
          <div className="element-card flex flex-col overflow-y-auto" style={{ borderRadius: 12 }}>
            {centerPanel}
          </div>
        </div>
      </div>

      {/* ── Mobile: FAB buttons ── */}
      <div className="mob-fab-row">
        {mobileFabs.map(fab => (
          <button key={fab.id} className={`mob-fab ${fab.variant}`} type="button"
            onClick={() => onMobilePanelChange(mobilePanel === fab.id ? null : fab.id)}>
            <fab.icon className="h-3.5 w-3.5" /> {fab.label}
          </button>
        ))}
      </div>

      {/* ── Mobile: Bottom Sheet ── */}
      <div className={'mob-bottom-sheet' + (mobilePanel ? ' open' : '')}>
        <div style={{ padding: '4px 0 8px', cursor: 'pointer' }} onClick={() => onMobilePanelChange(null)}>
          <div className="mob-sheet-handle" />
        </div>
        <div className="px-3 pb-1 text-xs font-semibold text-slate-500">
          {mobileFabs.find(f => f.id === mobilePanel)?.label || ''}
        </div>
        <div className="mob-sheet-body px-2">
          {mobilePanel === mobileFabs[0].id && (mobileLeftPanel || leftPanel)}
          {mobilePanel === mobileFabs[1].id && rightPanel}
        </div>
      </div>
    </>
  );
}
