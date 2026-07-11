import { db } from '../db.js';
import { authenticate, requireWg, scopedGet } from '../hooks.js';
import { cleanString, optionalString, httpError, MSG } from '../util.js';
import { broadcast } from '../events.js';
import { notify } from '../notify.js';

// frühestens nach 12 stunden darf dieselbe person erneut an dieselbe aufgabe erinnern
const REMIND_COOLDOWN_HOURS = 12;

export default async function feedbackRoutes(app) {
  const guard = { preHandler: [authenticate, requireWg] };

  app.get('/api/feedback', guard, (req) => {
    const feed = db
      .prepare('SELECT * FROM feedback WHERE wg_id = ? ORDER BY id DESC LIMIT 50')
      .all(req.wgId);
    return { feed };
  });

  // feedback zur app selbst — landet für alle sichtbar auf der pinnwand
  app.post('/api/feedback/app', guard, (req, reply) => {
    const text = cleanString(req.body?.text, 500);
    if (!text) return httpError(reply, 400, MSG.badInput);
    db.prepare(`INSERT INTO feedback (wg_id, type, text, from_user) VALUES (?, 'app', ?, ?)`)
      .run(req.wgId, text, req.userId);
    broadcast(req.wgId, 'feedback', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // lob oder verbesserungswunsch zu erledigten aufgaben einer person
  app.post('/api/feedback/task', guard, (req, reply) => {
    const toUser = Number(req.body?.toUser);
    const rating = req.body?.rating;
    const text = optionalString(req.body?.text, 500);
    if (!['up', 'down'].includes(rating) || toUser === req.userId) return httpError(reply, 400, MSG.badInput);
    const member = db
      .prepare('SELECT 1 FROM memberships WHERE wg_id = ? AND user_id = ? AND active = 1')
      .get(req.wgId, toUser);
    if (!member) return httpError(reply, 400, MSG.badInput);

    let task = null;
    if (req.body?.taskId) {
      task = scopedGet(reply, 'tasks', req.body.taskId, req.wgId);
      if (!task) return;
    }
    db.prepare(
      `INSERT INTO feedback (wg_id, type, task_id, task_title, to_user, rating, text, from_user)
       VALUES (?, 'task', ?, ?, ?, ?, ?, ?)`
    ).run(req.wgId, task?.id ?? null, task?.title ?? null, toUser, rating, text, req.userId);

    const me = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId);
    const what = task ? ` für „${task.title}"` : '';
    const message = rating === 'up'
      ? `👍 Lob von ${me.name}${what}${text ? `: ${text}` : ''}`
      : `Feedback von ${me.name}${what}${text ? `: ${text}` : ''}`;
    notify(req.wgId, 'tasks', message, { onlyUserIds: [toUser] });
    broadcast(req.wgId, 'feedback', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // andere mitglieder an ihre offene aufgabe erinnern (anstupsen)
  app.post('/api/feedback/remind', guard, (req, reply) => {
    const task = scopedGet(reply, 'tasks', req.body?.taskId, req.wgId);
    if (!task) return;
    if (task.status !== 'open' || !task.assigned_to || task.assigned_to === req.userId) {
      return httpError(reply, 400, MSG.badInput);
    }
    const recent = db
      .prepare(
        `SELECT 1 FROM feedback WHERE type = 'reminder' AND task_id = ? AND from_user = ?
         AND created_at > datetime('now', '-${REMIND_COOLDOWN_HOURS} hours')`
      )
      .get(task.id, req.userId);
    if (recent) return httpError(reply, 429, 'Du hast dafür vor Kurzem schon erinnert — gib etwas Zeit.');

    db.prepare(
      `INSERT INTO feedback (wg_id, type, task_id, task_title, to_user, from_user)
       VALUES (?, 'reminder', ?, ?, ?, ?)`
    ).run(req.wgId, task.id, task.title, task.assigned_to, req.userId);

    const me = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId);
    notify(req.wgId, 'tasks', `🔔 ${me.name} erinnert dich an: „${task.title}"`, { onlyUserIds: [task.assigned_to] });
    broadcast(req.wgId, 'feedback', {}, { excludeUserId: req.userId });
    return { ok: true };
  });
}
