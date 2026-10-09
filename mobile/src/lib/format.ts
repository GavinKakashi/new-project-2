export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0) return timeUntil(iso);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function timeUntil(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (s < 60) return 'in <1m';
  if (s < 3600) return `in ${Math.round(s / 60)}m`;
  if (s < 86400) return `in ${Math.round(s / 3600)}h`;
  return `in ${Math.round(s / 86400)}d`;
}

export function duration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export const money = (usd: number) => (usd < 0.01 && usd > 0 ? `<$0.01` : `$${usd.toFixed(2)}`);

export const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

const CRON_PRESETS: Record<string, string> = {
  '*/15 * * * *': 'Every 15 minutes',
  '0 * * * *': 'Every hour',
  '0 */6 * * *': 'Every 6 hours',
  '0 9 * * *': 'Daily at 9:00',
  '0 7 * * 1-5': 'Weekdays at 7:00',
  '0 9 * * 1': 'Mondays at 9:00',
};

export const SCHEDULE_PRESETS = Object.entries(CRON_PRESETS).map(([cron, label]) => ({ cron, label }));

export function describeSchedule(cron: string | null): string {
  if (!cron) return 'Manual only';
  return CRON_PRESETS[cron] ?? `Cron: ${cron}`;
}
