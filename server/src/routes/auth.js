import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { signAccessToken, authenticate } from '../hooks.js';
import { isEmail, cleanString, randomToken, sha256, httpError, MSG } from '../util.js';

const REFRESH_DAYS = 30;
const LOCK_MINUTES = 15;
const MAX_FAILS = 5;

function issueTokens(userId) {
  const refresh = randomToken();
  db.prepare(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, datetime('now', '+${REFRESH_DAYS} days'))`
  ).run(userId, sha256(refresh));
  return { accessToken: signAccessToken(userId), refreshToken: refresh };
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

export default async function authRoutes(app) {
  // Strengeres Rate-Limit auf allen Auth-Endpunkten
  const rateLimit = { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } };

  // FR-AUTH-001
  app.post('/api/auth/register', rateLimit, (req, reply) => {
    const { email, name, password } = req.body || {};
    const cleanName = cleanString(name, 40);
    if (!isEmail(email) || !cleanName || typeof password !== 'string' || password.length < 8 || password.length > 200) {
      return httpError(reply, 400, MSG.badInput);
    }
    const normalized = email.trim().toLowerCase();
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalized)) {
      return httpError(reply, 409, MSG.emailTaken);
    }
    const hash = bcrypt.hashSync(password, 10);
    const { lastInsertRowid: userId } = db
      .prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
      .run(normalized, cleanName, hash);
    // Bestätigungs-E-Mail: v1 ohne SMTP — Stub, wird geloggt
    app.log.info({ email: normalized }, 'Bestätigungs-E-Mail (Stub) versendet');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId));
    return { user: publicUser(user), ...issueTokens(user.id) };
  });

  // FR-AUTH-002/003/004
  app.post('/api/auth/login', rateLimit, (req, reply) => {
    const { email, password } = req.body || {};
    if (!isEmail(email) || typeof password !== 'string') return httpError(reply, 400, MSG.badInput);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());

    // Generische Fehlermeldung: verrät nicht, ob die E-Mail existiert
    const fail = () => httpError(reply, 401, 'E-Mail oder Passwort ist falsch.');
    if (!user) return fail();

    if (user.lock_until && new Date(user.lock_until + 'Z') > new Date()) {
      return httpError(reply, 429, MSG.rateLimit);
    }

    if (!bcrypt.compareSync(password, user.password_hash)) {
      // Fehlversuchszähler mit 15-Minuten-Fenster
      const windowExpired = !user.first_fail_at || Date.now() - new Date(user.first_fail_at + 'Z').getTime() > LOCK_MINUTES * 60000;
      const fails = windowExpired ? 1 : user.failed_logins + 1;
      const lock = fails > MAX_FAILS ? `datetime('now', '+${LOCK_MINUTES} minutes')` : 'NULL';
      db.prepare(
        `UPDATE users SET failed_logins = ?, first_fail_at = ${windowExpired ? "datetime('now')" : 'first_fail_at'}, lock_until = ${lock} WHERE id = ?`
      ).run(fails, user.id);
      return fail();
    }

    db.prepare('UPDATE users SET failed_logins = 0, first_fail_at = NULL, lock_until = NULL WHERE id = ?').run(user.id);
    return { user: publicUser(user), ...issueTokens(user.id) };
  });

  app.post('/api/auth/refresh', rateLimit, (req, reply) => {
    const { refreshToken } = req.body || {};
    if (typeof refreshToken !== 'string') return httpError(reply, 401, MSG.unauthorized);
    const row = db
      .prepare(`SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > datetime('now')`)
      .get(sha256(refreshToken));
    if (!row) return httpError(reply, 401, MSG.unauthorized);
    // Rotation: alter Token wird ungültig
    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(row.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
    return { user: publicUser(user), ...issueTokens(user.id) };
  });

  app.post('/api/auth/logout', { preHandler: authenticate }, (req) => {
    const { refreshToken } = req.body || {};
    if (typeof refreshToken === 'string') {
      db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ? AND user_id = ?').run(sha256(refreshToken), req.userId);
    }
    return { ok: true };
  });

  // FR-AUTH-005 — Reset-Link wird geloggt (v1 ohne SMTP)
  app.post('/api/auth/forgot', rateLimit, (req) => {
    const { email } = req.body || {};
    if (isEmail(email)) {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
      if (user) {
        const token = randomToken();
        db.prepare(
          `INSERT INTO reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+60 minutes'))`
        ).run(user.id, sha256(token));
        app.log.warn({ resetLink: `/reset?token=${token}` }, 'Passwort-Reset-Link (Stub, 60 min gültig)');
      }
    }
    // Immer ok — kein E-Mail-Enumerieren möglich
    return { ok: true };
  });

  app.post('/api/auth/reset', rateLimit, (req, reply) => {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || typeof password !== 'string' || password.length < 8 || password.length > 200) {
      return httpError(reply, 400, MSG.badInput);
    }
    const row = db
      .prepare(`SELECT * FROM reset_tokens WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')`)
      .get(sha256(token));
    if (!row) return httpError(reply, 400, 'Dieser Link ist ungültig oder abgelaufen.');
    db.prepare('UPDATE reset_tokens SET used = 1 WHERE id = ?').run(row.id);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), row.user_id);
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(row.user_id);
    return { ok: true };
  });
}
