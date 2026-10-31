import type { Severity } from '@/vendor/shared/severity';

const STYLES: Record<Severity, string> = {
  CRITICAL: 'badge-red',
  WARNING: 'badge-amber',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={STYLES[severity]}>{severity}</span>;
}
