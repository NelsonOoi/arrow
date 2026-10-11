/**
 * Small shared UI pieces. Styles in styles/app.css; usage rules in DESIGN.md §6.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';


type Variant = 'primary' | 'ink' | 'outline' | 'quiet';

export function Button({
  variant = 'primary',
  size,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'lg' }) {
  return <button type="button" className={`btn btn--${variant} ${size ? `btn--${size}` : ''} ${className}`} {...rest} />;
}

export function ButtonLink({
  variant = 'primary',
  size,
  className = '',
  ...rest
}: LinkProps & { variant?: Variant; size?: 'lg' }) {
  return <Link className={`btn btn--${variant} ${size ? `btn--${size}` : ''} ${className}`} {...rest} />;
}

export function ArrowRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3.5 9.2 C 7 8.8, 10.5 9.1, 14 9 M10 5 L14.2 9 L10 13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Labeled text input. `dataField` is the backend field path this input edits
 * (see src/types.ts) — rendered as `data-field` for agents and tests.
 */
export function TextField({
  label,
  help,
  dataField,
  hideLabel,
  mono,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; help?: ReactNode; dataField?: string; hideLabel?: boolean; mono?: boolean }) {
  const id = rest.id ?? dataField ?? label;
  return (
    <div className="field">
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'field__label'}>
        {label}
      </label>
      <input id={id} data-field={dataField} className={`input ${mono ? 'input--mono' : ''}`} {...rest} />
      {help && <span className="field__help">{help}</span>}
    </div>
  );
}

export function TextArea({
  label,
  help,
  dataField,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; help?: ReactNode; dataField?: string }) {
  const id = rest.id ?? dataField ?? label;
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <textarea id={id} data-field={dataField} className="textarea" {...rest} />
      {help && <span className="field__help">{help}</span>}
    </div>
  );
}

/** Number input with a unit after it ("5 matches", "15 min"). */
export function NumberField({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  dataField,
  help,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  dataField: string;
  help?: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={dataField} className="field__label">
        {label}
      </label>
      <div className="input-suffix">
        <input
          id={dataField}
          data-field={dataField}
          className="input"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
        />
        <span>{unit}</span>
      </div>
      {help && <span className="field__help">{help}</span>}
    </div>
  );
}

export type Tone = 'moss' | 'ochre' | 'indigo' | 'pen' | 'ink';

/** Dot + word status. Status is never color alone (DESIGN.md §9). */
export function StatusTag({ tone, live, children }: { tone: Tone; live?: boolean; children: ReactNode }) {
  return <span className={`tag tag--${tone} ${live ? 'tag--live' : ''}`}>{children}</span>;
}
