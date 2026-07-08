import { randomBytes, createHash } from 'node:crypto';

// Einladungscodes ohne verwechselbare Zeichen (0/O, 1/I/L)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function inviteCode() {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

export function randomToken() {
  return randomBytes(32).toString('hex');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

export function cleanString(value, maxLen) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

export function optionalString(value, maxLen) {
  if (value === undefined || value === null || value === '') return null;
  return cleanString(value, maxLen);
}

export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addInterval(dateStr, interval) {
  const d = new Date(`${dateStr}T12:00:00`);
  if (interval === 'daily') d.setDate(d.getDate() + 1);
  else if (interval === 'weekly') d.setDate(d.getDate() + 7);
  else if (interval === 'biweekly') d.setDate(d.getDate() + 14);
  else if (interval === 'monthly') d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function httpError(reply, code, message) {
  return reply.code(code).send({ error: message });
}

export const MSG = {
  badInput: 'Bitte überprüfe deine Eingabe.',
  unauthorized: 'Bitte melde dich an.',
  forbidden: 'Du hast keinen Zugriff auf diese WG.',
  notFound: 'Dieser Eintrag existiert nicht mehr.',
  badCode: 'Dieser Einladungscode ist ungültig oder abgelaufen.',
  emailTaken: 'Für diese E-Mail existiert bereits ein Konto.',
  conflict: 'Der Eintrag wurde inzwischen geändert — bitte aktualisieren.',
  rateLimit: 'Zu viele Versuche. Bitte warte kurz.',
  server: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.'
};
