'use client';

import React, { useState } from 'react';
import {
  Info,
  ChevronDown,
  ChevronUp,
  ListChecks,
} from 'lucide-react';
import type { DocumentStats, AIAnalysis } from '@/lib/kb/validator';

export function ArtifactsNote({ hasArtifacts }: { hasArtifacts: DocumentStats['hasArtifacts'] }) {
  const found = [
    hasArtifacts.approvalStamps && 'штампи затвердження',
    hasArtifacts.changelog && 'перелік змін',
    hasArtifacts.signatureLines && 'рядки підписів',
  ].filter(Boolean) as string[];

  if (found.length === 0) return null;

  return (
    <div className="flex items-start gap-2 px-4 py-2.5 bg-blue-50/70 text-xs text-blue-700 border-t border-blue-100">
      <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-blue-400" aria-hidden="true" />
      <span>Буде автоматично прибрано при індексації: <strong>{found.join(', ')}</strong>.</span>
    </div>
  );
}

export function FixInstructionsPanel({ fixInstructions }: { fixInstructions: AIAnalysis['fixInstructions'] }) {
  const [open, setOpen] = useState(false);
  if (!fixInstructions?.length) return null;
  return (
    <div className="border-t border-slate-100">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={open ? 'Згорнути покрокові інструкції' : 'Розгорнути покрокові інструкції'}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset"
      >
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-indigo-400" aria-hidden="true" />
          <span className="text-sm font-medium text-slate-700">
            Як виправити ({fixInstructions.length})
          </span>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
          : <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4">
          {fixInstructions.map((item, i) => (
            <div key={i}>
              <p className="text-sm font-semibold text-slate-700 mb-1.5">{item.issue}</p>
              <ol className="space-y-1">
                {item.steps.map((step, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="text-indigo-500 font-semibold flex-shrink-0 w-4">{j + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
