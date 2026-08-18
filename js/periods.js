// ==========================================
// LEADERBOARD PERIOD HELPERS
// Tracks XP earned per period on the user doc as aggregates:
//   dailyXP / dailyResetDate, weeklyXP / weeklyResetDate,
//   monthlyXP / monthlyResetDate, yearlyXP / yearlyResetDate.
// A stored reset date that no longer matches the current period key means the
// aggregate belongs to a rolled-over period, so it counts as 0 XP.
// ==========================================

export const PERIOD_FIELDS = {
  daily: ['dailyXP', 'dailyResetDate'],
  weekly: ['weeklyXP', 'weeklyResetDate'],
  monthly: ['monthlyXP', 'monthlyResetDate'],
  yearly: ['yearlyXP', 'yearlyResetDate']
};

export function toDate(value) {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
}

// Key (YYYY-MM-DD) that starts the period containing the given date, UTC based.
export function periodKey(date, period) {
  const d = toDate(date);
  switch (period) {
    case 'weekly': {
      const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
      const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
      return start.toISOString().slice(0, 10);
    }
    case 'monthly':
      return d.toISOString().slice(0, 7) + '-01';
    case 'yearly':
      return d.getUTCFullYear() + '-01-01';
    case 'daily':
    default:
      return d.toISOString().slice(0, 10);
  }
}

// XP a user has earned in the given period (0 if the aggregate is stale).
export function getPeriodXP(userData, period) {
  const [xpField, resetField] = PERIOD_FIELDS[period] || PERIOD_FIELDS.daily;
  const currentKey = periodKey(new Date(), period);
  return (userData && userData[resetField] === currentKey) ? (userData[xpField] || 0) : 0;
}

// Builds {periodXP, periodResetDate} updates for every period when XP changes.
// xpDelta may be negative (reversal/adjustment); values never drop below 0.
export function buildPeriodXpUpdate(userData, xpDelta) {
  const now = new Date();
  const out = {};
  for (const period of Object.keys(PERIOD_FIELDS)) {
    const key = periodKey(now, period);
    const [xpField, resetField] = PERIOD_FIELDS[period];
    const current = (userData[resetField] === key) ? (userData[xpField] || 0) : 0;
    out[xpField] = Math.max(0, current + xpDelta);
    out[resetField] = key;
  }
  return out;
}

// For reward reversals: subtract XP from a period's aggregate only if the stored
// reset date still matches the key for when the quest was completed. This avoids
// clawing back XP from a period that has already rolled over. Returns an empty
// object when completedAt is unknown.
export function reversePeriodXpUpdate(userData, completedAt, xpDelta) {
  const out = {};
  if (!completedAt) return out;
  for (const period of Object.keys(PERIOD_FIELDS)) {
    const key = periodKey(completedAt, period);
    const [xpField, resetField] = PERIOD_FIELDS[period];
    if (userData[resetField] === key) {
      out[xpField] = Math.max(0, (userData[xpField] || 0) - xpDelta);
    }
  }
  return out;
}
