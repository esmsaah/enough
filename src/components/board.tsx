// Enough — board flow components (latest design). The 4-step header, chips and
// small icons shared by every screen in the tapping/statement flow. Visual only;
// screens pass their own data and handlers.
import type { ReactNode } from 'react';

/** The four steps the progress bar always shows (README). */
export const FLOW_STEPS = ['Pick', 'Check', 'Extras', 'Result'] as const;
export type FlowStep = 1 | 2 | 3 | 4;

export function FlowHeader({ step, onBack }: { step: FlowStep; onBack?: () => void }) {
  const label = FLOW_STEPS[step - 1];
  return (
    <header className="flow-head">
      <button type="button" className="flow-head__back" aria-label="Back" onClick={onBack} disabled={!onBack}>
        <BackIcon />
      </button>
      <div className="flow-head__bar" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step} aria-label={`Step ${step} of 4, ${label}`}>
        {FLOW_STEPS.map((_, i) => <div key={i} className={`flow-head__seg${i < step ? ' on' : ''}`} />)}
      </div>
      <span className="flow-head__label">{label} · {step}/4</span>
    </header>
  );
}

export function BoardChip({
  label,
  price,
  selected,
  onClick,
}: {
  label: ReactNode;
  price?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" className={`chip${selected ? ' on' : ''}`} aria-pressed={selected} onClick={onClick}>
      {selected ? <CheckIcon /> : <PlusIcon />}
      {label}
      {price && <span className="p">{price}</span>}
    </button>
  );
}

/** Segmented control: one choice highlighted (board `.seg`). */
export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? 'on' : ''} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Board stepper (the `.stp` ± control). Renders the value via `format`. */
export function Stepper({
  value,
  min = 0,
  step = 1,
  onChange,
  format,
}: {
  value: number;
  min?: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  return (
    <div className="stp">
      <button type="button" aria-label="Less" onClick={() => onChange(Math.max(min, round2(value - step)))}>−</button>
      <b>{format ? format(value) : value}</b>
      <button type="button" aria-label="More" onClick={() => onChange(round2(value + step))}>+</button>
    </div>
  );
}

export function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
export function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}
export function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" />
    </svg>
  );
}
export function StatementIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" />
    </svg>
  );
}
