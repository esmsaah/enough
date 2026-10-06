// Enough — shared components. Section 12 of ENOUGH_BRIEF.md.
// Built once, no UI kit. No shadows, gradients, emoji or tilted cards.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './ui.css';

export function Button({
  children,
  variant = 'primary',
  full,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; full?: boolean }) {
  return (
    <button className={`btn btn--${variant} ${full ? 'btn--full' : ''}`} {...rest}>
      {children}
    </button>
  );
}

export function Chip({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" className={`chip ${selected ? 'chip--on' : ''}`} aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  );
}

export function Stepper({ value, min = 0, max = 30, onChange }: { value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button type="button" aria-label="less" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span className="mono stepper__value">{value}</span>
      <button type="button" aria-label="more" onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

export function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={total}>
      <div className="progress__fill" style={{ width: `${(step / total) * 100}%` }} />
    </div>
  );
}

/** Verdict shown by label + shape, never by colour alone (WCAG, §14). */
export function VerdictBadge({ verdict }: { verdict: 'keep' | 'lookAgain' | 'cut' }) {
  const label = verdict === 'cut' ? 'Cut' : verdict === 'lookAgain' ? 'Look again' : 'Keep';
  return <span className={`verdict verdict--${verdict}`}>{label}</span>;
}

/** An irregular hand-drawn strike over cut text (drawn quickly on mount). */
export function PenStrike({ children }: { children: ReactNode }) {
  return (
    <span className="penstrike">
      {children}
      <svg className="penstrike__line" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
        <path d="M1 7 C 20 3, 38 10, 55 6 S 88 4, 99 7" fill="none" stroke="var(--coral-pen)" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** A short handwritten note, four words or fewer, slightly rotated. */
export function HandNote({ children }: { children: ReactNode }) {
  return <span className="hand">{children}</span>;
}
