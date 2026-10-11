/**
 * Custom dropdown (listbox). Used where options need a description line or a
 * trailing action, e.g. the voice picker's ▶ sample button.
 *
 * Keyboard: Enter/Space/ArrowDown opens; ArrowUp/ArrowDown move; Enter selects;
 * Escape closes. Clicking outside closes.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type DropdownOption<V extends string | number> = {
  value: V;
  label: string;
  description?: string;
  /** Rendered at the end of the option row. Clicks inside it don't select the option. */
  trailing?: ReactNode;
};

export function Dropdown<V extends string | number>({
  label,
  value,
  options,
  onChange,
  dataField,
  help,
}: {
  label: string;
  value: V;
  options: DropdownOption<V>[];
  onChange: (value: V) => void;
  /** Backend field path this control edits (see src/types.ts). */
  dataField: string;
  help?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (i: number) => {
    onChange(options[i].value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && ['Enter', ' ', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    }
  };

  return (
    <div className="field" ref={rootRef}>
      <span className="field__label" id={labelId}>
        {label}
      </span>
      <div className="dropdown">
        <button
          ref={triggerRef}
          type="button"
          className="dropdown__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={labelId}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          data-field={dataField}
          data-value={value}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={onKeyDown}
        >
          <span>{selected?.label}</span>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 5.2 L7 9 L11 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <ul className="dropdown__menu" role="listbox" id={listId} aria-labelledby={labelId}>
            {options.map((o, i) => (
              <li
                key={String(o.value)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                data-active={i === active}
                className="dropdown__option"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <span className="dropdown__text">
                  <span className="dropdown__label">{o.label}</span>
                  {o.description && <span className="dropdown__desc">{o.description}</span>}
                </span>
                {o.trailing && <span onClick={(e) => e.stopPropagation()}>{o.trailing}</span>}
                {o.value === value && (
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8.5 L6.5 12 L13 4.5" stroke="var(--ink)" strokeWidth="2" fill="none" strokeLinecap="round" />
                  </svg>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {help && <span className="field__help">{help}</span>}
    </div>
  );
}
