import jwt from 'jsonwebtoken';
import { db, loadSecrets } from './db.js';
import { httpError, MSG } from './util.js';

const { jwt: JWT_SECRET } = loadSecrets();

export const ACCESS_TTL = '15m';

export function signAccessToken(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: ACCESS_TTL });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET).uid;
  } catch {
    return null;
  }
}

const membershipStmt = db.prepare(
  `SELECT m.wg_id, m.user_id, m.color_index, w.name AS wg_name, w.admin_id, w.invite_code
   FROM memberships m JOIN wgs w ON w.id = m.wg_id
   WHERE m.user_id = ? AND m.active = 1 AND w.archived = 0`
);

/** Hook: erfordert gültiges Access-Token; setzt req.userId */
export function authenticate(req, reply, done) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const uid = token ? verifyAccessToken(token) : null;
  if (!uid) return httpError(reply, 401, MSG.unauthorized);
  req.userId = uid;
  done();
}

/**
 * Hook: erfordert aktive WG-Mitgliedschaft (FR-WG-007).
 * Die WG kommt IMMER aus der Mitgliedschaft des Nutzers, nie aus Client-Daten.
 */
export function requireWg(req, reply, done) {
  const membership = membershipStmt.get(req.userId);
  if (!membership) return httpError(reply, 403, MSG.forbidden);
  req.wgId = membership.wg_id;
  req.isAdmin = membership.admin_id === req.userId;
  req.wg = membership;
  done();
}

/**
 * Objekt-Zugriff prüfen: existiert nicht -> 404, gehört anderer WG -> 403 (AC-009).
 * Gibt die Zeile zurück oder null (Antwort wurde dann bereits gesendet).
 */
export function scopedGet(reply, table, id, wgId) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(id) || 0);
  if (!row) {
    httpError(reply, 404, MSG.notFound);
    return null;
  }
  if (row.wg_id !== wgId) {
    httpError(reply, 403, MSG.forbidden);
    return null;
  }
  return row;
}
