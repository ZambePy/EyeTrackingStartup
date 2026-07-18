// Sprint U2 — AAC grid cell component.

import { dwellProgress, dwellTargetId } from '../../engine/SelectionEngine';

export interface CellDef {
  id: string;
  label: string;
  symbol?: string;       // ARASAAC symbol filename or URL (U2)
  action: CellAction;
  color?: string;
}

export type CellAction =
  | { type: 'speak';    text: string }
  | { type: 'append';   text: string }          // adds to message bar
  | { type: 'navigate'; route: string }
  | { type: 'back' }
  | { type: 'clear' }
  | { type: 'delete-word' };

interface CellProps {
  cell: CellDef;
  onActivate: (cell: CellDef) => void;
}

export function Cell({ cell, onActivate }: CellProps) {
  const isTarget  = dwellTargetId.value === cell.id;
  const progress  = isTarget ? dwellProgress.value : 0;
  const ringOffset = 100 - progress * 100;  // SVG stroke-dashoffset

  return (
    <button
      class={`aac-cell dwell-target ${isTarget ? 'aac-cell--active' : ''}`}
      data-gaze-id={cell.id}
      style={cell.color ? { '--cell-accent': cell.color } as Record<string, string> : undefined}
      onClick={() => onActivate(cell)}
      aria-label={cell.label}
    >
      {/* Dwell progress ring */}
      {isTarget && progress > 0 && (
        <svg class="dwell-ring" viewBox="0 0 36 36" aria-hidden="true">
          <circle class="dwell-ring__track" cx="18" cy="18" r="15.9" />
          <circle
            class="dwell-ring__fill"
            cx="18" cy="18" r="15.9"
            style={{ strokeDashoffset: ringOffset }}
          />
        </svg>
      )}

      {cell.symbol && <img class="cell-symbol" src={cell.symbol} alt="" aria-hidden="true" />}
      <span class="cell-label">{cell.label}</span>
    </button>
  );
}
