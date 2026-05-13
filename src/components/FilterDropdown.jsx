import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Multi-select dropdown for filter bar.
 * Props:
 *   label       — button label string
 *   options     — [{ id, name }] or [{ id, name, sub }]
 *   selected    — Set of selected ids
 *   onChange    — (id, add) => void
 *   multi       — allow multi-select (default true)
 *   renderName  — optional fn(id) => display string for chips
 */
export default function FilterDropdown({
  label, options = [], selected = new Set(),
  onChange, multi = true, renderName,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = useCallback((id) => {
    if (multi) {
      onChange(id, !selected.has(id));
    } else {
      // Single-select: clicking same item deselects; clicking new one selects it
      if (selected.has(id)) onChange(id, false);
      else {
        // Clear previous and select new
        selected.forEach(sid => onChange(sid, false));
        onChange(id, true);
      }
    }
    if (!multi) setOpen(false);
  }, [multi, selected, onChange]);

  const selectedArr = [...selected];
  const labelText = selectedArr.length > 0
    ? `${label} (${selectedArr.length})`
    : label;

  return (
    <div className="filter-dropdown" ref={ref}>
      <button
        className={`filter-dropdown-trigger${selectedArr.length > 0 ? ' has-selection' : ''}`}
        onClick={() => setOpen(o => !o)}
        type="button"
      >
        <span>{labelText}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="filter-dropdown-panel">
          {options.length === 0 ? (
            <div className="filter-dropdown-empty">No options</div>
          ) : (
            options.map(opt => {
              const isSel = selected.has(opt.id);
              const name = renderName ? renderName(opt.id) : (opt.name || opt.id);
              return (
                <label key={opt.id} className={`filter-dropdown-item${isSel ? ' selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(opt.id)}
                    className="filter-dropdown-check"
                  />
                  <span className="filter-dropdown-name">{name}</span>
                  {opt.sub && <span className="filter-dropdown-sub">{opt.sub}</span>}
                </label>
              );
            })
          )}
        </div>
      )}

      {/* Chips for selected items */}
      {selectedArr.length > 0 && (
        <div className="filter-dropdown-chips">
          {selectedArr.map(id => (
            <span key={id} className="filter-chip">
              {renderName ? renderName(id) : id}
              <button
                className="filter-chip-x"
                onClick={(e) => { e.stopPropagation(); onChange(id, false); }}
                type="button"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
