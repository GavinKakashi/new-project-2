export const colors = {
  bg: '#0B0B12',
  surface: '#14141F',
  surfaceAlt: '#1C1C2A',
  border: '#272739',
  text: '#EDEDF5',
  textDim: '#9A9AB0',
  textFaint: '#6B6B82',
  primary: '#7C5CFF',
  primaryDim: '#2A2250',
  success: '#22C55E',
  warning: '#FFB020',
  danger: '#EF4444',
  info: '#38BDF8',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };

export const statusColor: Record<string, string> = {
  queued: colors.textDim,
  running: colors.info,
  awaiting_approval: colors.warning,
  succeeded: colors.success,
  failed: colors.danger,
  cancelled: colors.textFaint,
  active: colors.success,
  paused: colors.textFaint,
};

export const statusLabel: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  awaiting_approval: 'Needs approval',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  active: 'Active',
  paused: 'Paused',
};

export const AGENT_COLORS = ['#7C5CFF', '#38BDF8', '#22C55E', '#FFB020', '#EF4444', '#EC4899', '#14B8A6', '#F97316'];
export const AGENT_AVATARS = ['🤖', '🔎', '☀️', '🛰️', '🛠️', '📈', '✍️', '📬', '🧠', '🦾', '📰', '🧪'];
