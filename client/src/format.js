// Personenfarben: Farbe trägt Bedeutung (Mitglied), zusätzlich immer Initialen/Name
export const PERSON_COLORS = ['#E8590C', '#1971C2', '#9C36B5', '#2F9E44', '#E64980', '#F08C00', '#0CA678', '#6741D9'];

export function personColor(colorIndex) {
  return PERSON_COLORS[(colorIndex ?? 0) % PERSON_COLORS.length];
}

export function initials(name) {
  const parts = (name || '').split(/\s+/).map((p) => p.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function formatEuro(cents) {
  return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/** '12,34' | '12.34' | '12' → Integer-Cent (keine Float-Rundungsfehler) */
export function parseEuro(text) {
  if (typeof text !== 'string') return null;
  const match = text.trim().replace(/\s|€/g, '').match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  if (!match) return null;
  const cents = parseInt(match[1], 10) * 100 + parseInt((match[2] || '0').padEnd(2, '0'), 10);
  return cents > 0 ? cents : null;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function formatDateShort(iso) {
  if (!iso) return '';
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Relative Angabe für Fälligkeiten */
export function dueLabel(iso, today) {
  if (!iso) return 'Ohne Datum';
  if (iso < today) {
    const days = Math.round((new Date(today) - new Date(iso)) / 86400000);
    return days === 1 ? 'Seit gestern überfällig' : `Seit ${days} Tagen überfällig`;
  }
  if (iso === today) return 'Heute fällig';
  const days = Math.round((new Date(iso) - new Date(today)) / 86400000);
  if (days === 1) return 'Morgen';
  if (days < 7) return formatDateShort(iso);
  return formatDate(iso);
}

export function timeAgo(sqlUtc) {
  const ms = Date.now() - new Date(sqlUtc + 'Z').getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}

export const INTERVAL_LABELS = {
  daily: 'Täglich',
  weekly: 'Wöchentlich',
  biweekly: 'Alle 2 Wochen',
  monthly: 'Monatlich'
};

/** Montag der Woche von `iso` + Offset in Wochen */
export function weekStart(iso, offsetWeeks = 0) {
  const d = new Date(`${iso}T12:00:00`);
  const day = (d.getDay() + 6) % 7; // Mo = 0
  d.setDate(d.getDate() - day + offsetWeeks * 7);
  return d;
}

export function weekDays(startDate) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}
