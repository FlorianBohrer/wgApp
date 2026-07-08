import { db } from '../db.js';
import { authenticate, requireWg } from '../hooks.js';
import { inviteCode, cleanString, httpError, MSG } from '../util.js';
import { broadcast } from '../events.js';
import { notify } from '../notify.js';

const activeMembership = db.prepare(
  `SELECT m.*, w.name AS wg_name, w.admin_id, w.invite_code FROM memberships m
   JOIN wgs w ON w.id = m.wg_id WHERE m.user_id = ? AND m.active = 1 AND w.archived = 0`
);

export function membersOf(wgId, includeInactive = false) {
  return db
    .prepare(
      `SELECT u.id, u.name, m.color_index, m.active, m.joined_at
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.wg_id = ? ${includeInactive ? '' : 'AND m.active = 1'} ORDER BY m.joined_at`
    )
    .all(wgId);
}

/** Austritt/Entfernen (FR-WG-005/006): Aufgaben umverteilen, Salden einfrieren, ggf. Admin übertragen */
function removeMember(wgId, userId) {
  const wg = db.prepare('SELECT * FROM wgs WHERE id = ?').get(wgId);

  // Rotationen: Mitglied austragen, offene Instanzen an nächstes aktives Mitglied
  const rotations = db
    .prepare(`SELECT r.id FROM rotations r JOIN rotation_members rm ON rm.rotation_id = r.id
              WHERE r.wg_id = ? AND r.active = 1 AND rm.user_id = ?`)
    .all(wgId, userId);
  for (const { id: rotId } of rotations) {
    db.prepare('DELETE FROM rotation_members WHERE rotation_id = ? AND user_id = ?').run(rotId, userId);
    const remaining = db
      .prepare(`SELECT rm.user_id FROM rotation_members rm JOIN memberships m ON m.user_id = rm.user_id AND m.wg_id = ?
                WHERE rm.rotation_id = ? AND m.active = 1 ORDER BY rm.sort_order`)
      .all(wgId, rotId);
    if (remaining.length === 0) {
      db.prepare('UPDATE rotations SET active = 0 WHERE id = ?').run(rotId);
      db.prepare(`UPDATE tasks SET assigned_to = NULL WHERE rotation_id = ? AND status = 'open'`).run(rotId);
    } else {
      const rot = db.prepare('SELECT position FROM rotations WHERE id = ?').get(rotId);
      const next = remaining[rot.position % remaining.length].user_id;
      db.prepare(`UPDATE tasks SET assigned_to = ? WHERE rotation_id = ? AND assigned_to = ? AND status = 'open'`)
        .run(next, rotId, userId);
    }
  }
  // Einmalige Aufgaben: zur Neuverteilung markieren
  db.prepare(`UPDATE tasks SET assigned_to = NULL WHERE wg_id = ? AND assigned_to = ? AND status = 'open' AND rotation_id IS NULL`)
    .run(wgId, userId);

  // Mitgliedschaft deaktivieren — Salden bleiben eingefroren sichtbar
  db.prepare(`UPDATE memberships SET active = 0, left_at = datetime('now') WHERE wg_id = ? AND user_id = ?`).run(wgId, userId);

  // Admin-Übergabe an dienstältestes verbleibendes Mitglied, sonst archivieren
  if (wg.admin_id === userId) {
    const oldest = db
      .prepare(`SELECT user_id FROM memberships WHERE wg_id = ? AND active = 1 ORDER BY joined_at LIMIT 1`)
      .get(wgId);
    if (oldest) {
      db.prepare('UPDATE wgs SET admin_id = ? WHERE id = ?').run(oldest.user_id, wgId);
    } else {
      db.prepare('UPDATE wgs SET archived = 1 WHERE id = ?').run(wgId);
    }
  }
  broadcast(wgId, 'wg', {});
  broadcast(wgId, 'tasks', {});
}

export default async function wgRoutes(app) {
  app.get('/api/me', { preHandler: authenticate }, (req) => {
    const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.userId);
    const membership = activeMembership.get(req.userId);
    return {
      user,
      wg: membership
        ? { id: membership.wg_id, name: membership.wg_name, isAdmin: membership.admin_id === req.userId }
        : null
    };
  });

  app.patch('/api/me', { preHandler: authenticate }, (req, reply) => {
    const name = cleanString(req.body?.name, 40);
    if (!name) return httpError(reply, 400, MSG.badInput);
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.userId);
    return { ok: true };
  });

  // DSGVO: Konto löschen — personenbezogene Daten entfernen, Beiträge anonymisieren
  app.delete('/api/me', { preHandler: authenticate }, (req) => {
    const membership = activeMembership.get(req.userId);
    if (membership) removeMember(membership.wg_id, req.userId);
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.userId);
    db.prepare(`UPDATE users SET name = 'Ehemaliges Mitglied', email = 'geloescht-' || id || '@wg-app.invalid',
                password_hash = 'x', failed_logins = 0 WHERE id = ?`).run(req.userId);
    return { ok: true };
  });

  // FR-WG-001
  app.post('/api/wg', { preHandler: authenticate }, (req, reply) => {
    const name = cleanString(req.body?.name, 60);
    if (!name) return httpError(reply, 400, MSG.badInput);
    if (activeMembership.get(req.userId)) return httpError(reply, 409, 'Du bist bereits Mitglied einer WG.');
    const { lastInsertRowid: wgId } = db
      .prepare('INSERT INTO wgs (name, invite_code, admin_id) VALUES (?, ?, ?)')
      .run(name, inviteCode(), req.userId);
    db.prepare('INSERT INTO memberships (wg_id, user_id, color_index) VALUES (?, ?, 0)').run(Number(wgId), req.userId);
    db.prepare('INSERT INTO shopping_lists (wg_id, name) VALUES (?, ?)').run(Number(wgId), 'Einkaufsliste');
    return { ok: true };
  });

  // FR-WG-002/003 — Rate-Limit gegen Code-Enumerieren
  app.post('/api/wg/join', {
    preHandler: authenticate,
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }
  }, (req, reply) => {
    const code = cleanString(req.body?.code, 8);
    if (!code) return httpError(reply, 400, MSG.badInput);
    if (activeMembership.get(req.userId)) return httpError(reply, 409, 'Du bist bereits Mitglied einer WG.');
    const wg = db.prepare('SELECT * FROM wgs WHERE invite_code = ? AND archived = 0').get(code.toUpperCase());
    if (!wg) return httpError(reply, 404, MSG.badCode);

    // Farbe: nächster freier Index der 8er-Palette
    const used = db.prepare('SELECT color_index FROM memberships WHERE wg_id = ?').all(wg.id).map((r) => r.color_index);
    let color = 0;
    while (used.includes(color) && color < 7) color++;

    const existing = db.prepare('SELECT * FROM memberships WHERE wg_id = ? AND user_id = ?').get(wg.id, req.userId);
    if (existing) {
      db.prepare('UPDATE memberships SET active = 1, left_at = NULL WHERE id = ?').run(existing.id);
    } else {
      db.prepare('INSERT INTO memberships (wg_id, user_id, color_index) VALUES (?, ?, ?)').run(wg.id, req.userId, color);
    }
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId);
    notify(wg.id, 'wg', `${user.name} ist der WG beigetreten. 🎉`, { actorId: req.userId });
    broadcast(wg.id, 'wg', {});
    return { ok: true };
  });

  app.get('/api/wg', { preHandler: [authenticate, requireWg] }, (req) => {
    return {
      id: req.wgId,
      name: req.wg.wg_name,
      inviteCode: req.wg.invite_code,
      adminId: req.wg.admin_id,
      isAdmin: req.isAdmin,
      members: membersOf(req.wgId, true)
    };
  });

  // FR-WG-004
  app.post('/api/wg/renew-code', { preHandler: [authenticate, requireWg] }, (req, reply) => {
    if (!req.isAdmin) return httpError(reply, 403, 'Nur der WG-Admin kann den Code erneuern.');
    const code = inviteCode();
    db.prepare('UPDATE wgs SET invite_code = ? WHERE id = ?').run(code, req.wgId);
    return { inviteCode: code };
  });

  app.post('/api/wg/leave', { preHandler: [authenticate, requireWg] }, (req) => {
    removeMember(req.wgId, req.userId);
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId);
    notify(req.wgId, 'wg', `${user.name} hat die WG verlassen.`, { actorId: req.userId });
    return { ok: true };
  });

  app.delete('/api/wg/members/:id', { preHandler: [authenticate, requireWg] }, (req, reply) => {
    if (!req.isAdmin) return httpError(reply, 403, 'Nur der WG-Admin kann Mitglieder entfernen.');
    const targetId = Number(req.params.id);
    if (targetId === req.userId) return httpError(reply, 400, 'Nutze dafür „WG verlassen".');
    const member = db
      .prepare('SELECT * FROM memberships WHERE wg_id = ? AND user_id = ? AND active = 1')
      .get(req.wgId, targetId);
    if (!member) return httpError(reply, 404, MSG.notFound);
    removeMember(req.wgId, targetId);
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(targetId);
    notify(req.wgId, 'wg', `${user.name} wurde aus der WG entfernt.`, { actorId: req.userId });
    return { ok: true };
  });
}
