// Enough — receipt with torn top and bottom edges. Section 12.
import type { ReactNode } from 'react';

function TornEdge({ flip }: { flip?: boolean }) {
  return (
    <svg className="receipt__edge" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" style={flip ? { transform: 'scaleY(-1)' } : undefined}>
      <path d="M0 4 L4 0 L8 4 L12 0 L16 4 L20 0 L24 4 L28 0 L32 4 L36 0 L40 4 L44 0 L48 4 L52 0 L56 4 L60 0 L64 4 L68 0 L72 4 L76 0 L80 4 L84 0 L88 4 L92 0 L96 4 L100 0 L100 4 Z" fill="var(--paper)" />
    </svg>
  );
}

export function Receipt({ children }: { children: ReactNode }) {
  return (
    <div>
      <TornEdge />
      <div className="receipt">{children}</div>
      <TornEdge flip />
    </div>
  );
}
