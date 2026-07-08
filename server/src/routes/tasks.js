import { db } from '../db.js';
import { authenticate, requireWg, scopedGet } from '../hooks.js';
import { cleanString, optionalString, isIsoDate, todayLocal, addInterval, httpError, MSG } from '../util.js';
import { broadcast } from '../events.js';
import { notify } from '../notify.js';

const INTERVALS = ['daily', 'weekly', 'biweekly', 'monthly'];

function activeRotationMembers(rotationId, wgId) {
  return db
    .prepare(
      `SELECT rm.user_id FROM rotation_members rm
       JOIN memberships m ON m.user_id = rm.user_id AND m.wg_id = ?
       WHERE rm.rotation_id = ? AND m.active = 1 ORDER BY rm.sort_order`
    )
    .all(wgId, rotationId)
    .map((r) => r.user_id);
}

/**
 * FR-ROTA-002/003: nächste Instanz erzeugen und der nächsten Person zuweisen.
 * Wird bei Erledigung UND bei Intervall-Ablauf (Scheduler) aufgerufen.
 * Das rotated-Flag stellt sicher, dass pro Instanz nur EIN Nachfolger entsteht.
 */
export function advanceRotation(task) {
  const changed = db
    .prepare(`UPDATE tasks SET rotated = 1 WHERE id = ? AND rotated = 0`)
    .run(task.id);
  if (changed.changes === 0) return null;

  const rotation = db.prepare('SELECT * FROM rotations WHERE id = ? AND active = 1').get(task.rotation_id);
  if (!rotation) return null;
  const members = activeRotationMembers(rotation.id, rotation.wg_id);
  if (members.length === 0) return null;

  const nextPos = (rotation.position + 1) % members.length;
  const nextUser = members[nextPos];
  db.prepare('UPDATE rotations SET position = ? WHERE id = ?').run(nextPos, rotation.id);

  let nextDue = addInterval(task.due_date || todayLocal(), rotation.interval);
  if (nextDue < todayLocal()) nextDue = addInterval(todayLocal(), rotation.interval);

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO tasks (wg_id, rotation_id, title, description, due_date, assigned_to, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(rotation.wg_id, rotation.id, rotation.title, rotation.description, nextDue, nextUser, rotation.created_by);
  notify(rotation.wg_id, 'tasks', `Du bist dran: „${rotation.title}" (bis ${formatDate(nextDue)})`, {
    onlyUserIds: [nextUser]
  });
  broadcast(rotation.wg_id, 'tasks', {});
  return Number(lastInsertRowid);
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export default async function taskRoutes(app) {
  const guard = { preHandler: [authenticate, requireWg] };

  app.get('/api/tasks', guard, (req) => {
    const open = db
      .prepare(`SELECT * FROM tasks WHERE wg_id = ? AND status = 'open' ORDER BY due_date IS NULL, due_date, id`)
      .all(req.wgId);
    const done = db
      .prepare(`SELECT * FROM tasks WHERE wg_id = ? AND status = 'done' ORDER BY done_at DESC LIMIT 30`)
      .all(req.wgId);
    const rotations = db
      .prepare(`SELECT * FROM rotations WHERE wg_id = ? AND active = 1 ORDER BY created_at`)
      .all(req.wgId)
      .map((r) => ({ ...r, memberIds: activeRotationMembers(r.id, req.wgId) }));
    const swaps = db
      .prepare(
        `SELECT s.*, tf.title AS from_title, tf.assigned_to AS from_user, tt.title AS to_title, tt.assigned_to AS to_user,
                tf.due_date AS from_due, tt.due_date AS to_due
         FROM swap_requests s JOIN tasks tf ON tf.id = s.task_from JOIN tasks tt ON tt.id = s.task_to
         WHERE s.wg_id = ? AND s.status = 'pending'`
      )
      .all(req.wgId);
    return { open, done, rotations, swaps, today: todayLocal() };
  });

  // FR-TASK-001
  app.post('/api/tasks', guard, (req, reply) => {
    const title = cleanString(req.body?.title, 100);
    if (!title) return httpError(reply, 400, MSG.badInput);
    const description = optionalString(req.body?.description, 500);
    const dueDate = req.body?.dueDate;
    if (dueDate && !isIsoDate(dueDate)) return httpError(reply, 400, MSG.badInput);
    let assignedTo = req.body?.assignedTo ? Number(req.body.assignedTo) : null;
    if (assignedTo) {
      const member = db
        .prepare('SELECT 1 FROM memberships WHERE wg_id = ? AND user_id = ? AND active = 1')
        .get(req.wgId, assignedTo);
      if (!member) return httpError(reply, 400, MSG.badInput);
    }
    db.prepare(
      `INSERT INTO tasks (wg_id, title, description, due_date, assigned_to, created_by) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(req.wgId, title, description, dueDate || null, assignedTo, req.userId);
    if (assignedTo && assignedTo !== req.userId) {
      notify(req.wgId, 'tasks', `Neue Aufgabe für dich: „${title}"`, { onlyUserIds: [assignedTo] });
    }
    broadcast(req.wgId, 'tasks', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // FR-TASK-002 (+ FR-ROTA-002 bei Rotationsaufgaben)
  app.post('/api/tasks/:id/done', guard, (req, reply) => {
    const task = scopedGet(reply, 'tasks', req.params.id, req.wgId);
    if (!task) return;
    if (task.status === 'done') return { ok: true }; // idempotent (Offline-Sync: erledigt bleibt erledigt)
    db.prepare(`UPDATE tasks SET status = 'done', done_by = ?, done_at = datetime('now') WHERE id = ?`)
      .run(req.userId, task.id);
    if (task.rotation_id) advanceRotation(task);
    broadcast(req.wgId, 'tasks', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // FR-TASK-003
  app.post('/api/tasks/:id/undone', guard, (req, reply) => {
    const task = scopedGet(reply, 'tasks', req.params.id, req.wgId);
    if (!task) return;
    if (task.status !== 'done' || !task.done_at) return httpError(reply, 409, MSG.conflict);
    const doneMs = new Date(task.done_at + 'Z').getTime();
    if (Date.now() - doneMs > 24 * 3600 * 1000) {
      return httpError(reply, 409, 'Zurücknehmen ist nur innerhalb von 24 Stunden möglich.');
    }
    db.prepare(`UPDATE tasks SET status = 'open', done_by = NULL, done_at = NULL WHERE id = ?`).run(task.id);
    broadcast(req.wgId, 'tasks', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  app.delete('/api/tasks/:id', guard, (req, reply) => {
    const task = scopedGet(reply, 'tasks', req.params.id, req.wgId);
    if (!task) return;
    if (task.created_by !== req.userId && !req.isAdmin) {
      return httpError(reply, 403, 'Nur Ersteller oder Admin können Aufgaben löschen.');
    }
    db.prepare('DELETE FROM swap_requests WHERE task_from = ? OR task_to = ?').run(task.id, task.id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
    broadcast(req.wgId, 'tasks', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // FR-ROTA-001
  app.post('/api/rotations', guard, (req, reply) => {
    const title = cleanString(req.body?.title, 100);
    const interval = req.body?.interval;
    const memberIds = Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(Number) : [];
    const firstDue = req.body?.firstDue;
    if (!title || !INTERVALS.includes(interval) || memberIds.length === 0) return httpError(reply, 400, MSG.badInput);
    if (firstDue && !isIsoDate(firstDue)) return httpError(reply, 400, MSG.badInput);
    const activeIds = db
      .prepare('SELECT user_id FROM memberships WHERE wg_id = ? AND active = 1')
      .all(req.wgId)
      .map((r) => r.user_id);
    if (!memberIds.every((id) => activeIds.includes(id))) return httpError(reply, 400, MSG.badInput);
    const description = optionalString(req.body?.description, 500);

    const { lastInsertRowid: rotId } = db
      .prepare(`INSERT INTO rotations (wg_id, title, description, interval, created_by) VALUES (?, ?, ?, ?, ?)`)
      .run(req.wgId, title, description, interval, req.userId);
    memberIds.forEach((uid, i) => {
      db.prepare('INSERT INTO rotation_members (rotation_id, user_id, sort_order) VALUES (?, ?, ?)').run(Number(rotId), uid, i);
    });
    const due = firstDue || addInterval(todayLocal(), interval);
    db.prepare(
      `INSERT INTO tasks (wg_id, rotation_id, title, description, due_date, assigned_to, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(req.wgId, Number(rotId), title, description, due, memberIds[0], req.userId);
    if (memberIds[0] !== req.userId) {
      notify(req.wgId, 'tasks', `Du bist dran: „${title}" (bis ${formatDate(due)})`, { onlyUserIds: [memberIds[0]] });
    }
    broadcast(req.wgId, 'tasks', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // Teilnehmerkreis anpassen — neue Mitglieder ans Ende (FR-ROTA-003)
  app.patch('/api/rotations/:id', guard, (req, reply) => {
    const rotation = scopedGet(reply, 'rotations', req.params.id, req.wgId);
    if (!rotation) return;
    const memberIds = Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(Number) : null;
    if (!memberIds || memberIds.length === 0) return httpError(reply, 400, MSG.badInput);
    const current = activeRotationMembers(rotation.id, req.wgId);
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM rotation_members WHERE rotation_id = ?')
      .get(rotation.id).m;
    let order = maxOrder;
    for (const uid of memberIds) {
      if (!current.includes(uid)) {
        db.prepare('INSERT OR IGNORE INTO rotation_members (rotation_id, user_id, sort_order) VALUES (?, ?, ?)')
          .run(rotation.id, uid, ++order);
      }
    }
    for (const uid of current) {
      if (!memberIds.includes(uid)) {
        db.prepare('DELETE FROM rotation_members WHERE rotation_id = ? AND user_id = ?').run(rotation.id, uid);
      }
    }
    broadcast(req.wgId, 'tasks', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  app.delete('/api/rotations/:id', guard, (req, reply) => {
    const rotation = scopedGet(reply, 'rotations', req.params.id, req.wgId);
    if (!rotation) return;
    if (rotation.created_by !== req.userId && !req.isAdmin) {
      return httpError(reply, 403, 'Nur Ersteller oder Admin können Rotationen beenden.');
    }
    db.prepare('UPDATE rotations SET active = 0 WHERE id = ?').run(rotation.id);
    db.prepare(`DELETE FROM tasks WHERE rotation_id = ? AND status = 'open'`).run(rotation.id);
    broadcast(req.wgId, 'tasks', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // FR-ROTA-005: Tausch anfragen
  app.post('/api/tasks/:id/swap', guard, (req, reply) => {
    const own = scopedGet(reply, 'tasks', req.params.id, req.wgId);
    if (!own) return;
    const other = scopedGet(reply, 'tasks', req.body?.withTaskId, req.wgId);
    if (!other) return;
    if (own.assigned_to !== req.userId || own.status !== 'open') return httpError(reply, 400, MSG.badInput);
    if (!other.assigned_to || other.assigned_to === req.userId || other.status !== 'open') {
      return httpError(reply, 400, MSG.badInput);
    }
    db.prepare(`INSERT INTO swap_requests (wg_id, task_from, task_to, requested_by) VALUES (?, ?, ?, ?)`)
      .run(req.wgId, own.id, other.id, req.userId);
    const me = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId);
    notify(req.wgId, 'tasks', `${me.name} möchte „${own.title}" mit dir tauschen.`, { onlyUserIds: [other.assigned_to] });
    broadcast(req.wgId, 'tasks', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // Tausch bestätigen/ablehnen — nur die betroffene Person
  app.post('/api/swaps/:id/:action', guard, (req, reply) => {
    const swap = scopedGet(reply, 'swap_requests', req.params.id, req.wgId);
    if (!swap) return;
    if (swap.status !== 'pending') return httpError(reply, 409, MSG.conflict);
    const from = db.prepare('SELECT * FROM tasks WHERE id = ?').get(swap.task_from);
    const to = db.prepare('SELECT * FROM tasks WHERE id = ?').get(swap.task_to);
    if (to.assigned_to !== req.userId) return httpError(reply, 403, 'Nur die betroffene Person kann bestätigen.');

    if (req.params.action === 'confirm') {
      if (from.status !== 'open' || to.status !== 'open') return httpError(reply, 409, MSG.conflict);
      // Zuweisungen tauschen — Rotationsreihenfolge bleibt unverändert
      db.prepare('UPDATE tasks SET assigned_to = ? WHERE id = ?').run(to.assigned_to, from.id);
      db.prepare('UPDATE tasks SET assigned_to = ? WHERE id = ?').run(from.assigned_to, to.id);
      db.prepare(`UPDATE swap_requests SET status = 'confirmed' WHERE id = ?`).run(swap.id);
      notify(req.wgId, 'tasks', `Tausch bestätigt: „${from.title}" ↔ „${to.title}"`, { onlyUserIds: [swap.requested_by] });
    } else if (req.params.action === 'decline') {
      db.prepare(`UPDATE swap_requests SET status = 'declined' WHERE id = ?`).run(swap.id);
      notify(req.wgId, 'tasks', `Tausch für „${to.title}" wurde abgelehnt.`, { onlyUserIds: [swap.requested_by] });
    } else {
      return httpError(reply, 400, MSG.badInput);
    }
    broadcast(req.wgId, 'tasks', {}, { excludeUserId: req.userId });
    return { ok: true };
  });
}
