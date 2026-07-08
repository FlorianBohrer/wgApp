import { db } from '../db.js';
import { authenticate, requireWg, verifyAccessToken } from '../hooks.js';
import { subscribe } from '../events.js';
import { vapidPublicKey } from '../notify.js';
import { httpError, MSG } from '../util.js';

const CATEGORIES = ['tasks', 'shopping', 'costs', 'bucket', 'wg'];

export default async function notificationRoutes(app) {
  const guard = { preHandler: [authenticate, requireWg] };

  // SSE-Stream — EventSource kann keine Header setzen, daher Token als Query-Parameter
  app.get('/api/events', (req, reply) => {
    const uid = verifyAccessToken(String(req.query?.token || ''));
    if (!uid) return httpError(reply, 401, MSG.unauthorized);
    const membership = db
      .prepare(`SELECT m.wg_id FROM memberships m JOIN wgs w ON w.id = m.wg_id
                WHERE m.user_id = ? AND m.active = 1 AND w.archived = 0`)
      .get(uid);
    if (!membership) return httpError(reply, 403, MSG.forbidden);
    subscribe(membership.wg_id, uid, reply);
  });

  app.get('/api/notifications', guard, (req) => {
    const list = db
      .prepare('SELECT * FROM notifications WHERE user_id = ? AND wg_id = ? ORDER BY id DESC LIMIT 50')
      .all(req.userId, req.wgId);
    const unread = db
      .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND wg_id = ? AND read = 0')
      .get(req.userId, req.wgId).c;
    return { list, unread };
  });

  app.post('/api/notifications/read', guard, (req) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND wg_id = ?').run(req.userId, req.wgId);
    return { ok: true };
  });

  // FR-NOTIF-004: An/Aus pro Kategorie
  app.get('/api/notification-settings', { preHandler: authenticate }, (req) => {
    const rows = db.prepare('SELECT category, enabled FROM notification_settings WHERE user_id = ?').all(req.userId);
    const settings = Object.fromEntries(CATEGORIES.map((c) => [c, true]));
    for (const row of rows) settings[row.category] = !!row.enabled;
    return settings;
  });

  app.put('/api/notification-settings', { preHandler: authenticate }, (req, reply) => {
    const body = req.body || {};
    for (const category of CATEGORIES) {
      if (typeof body[category] === 'boolean') {
        db.prepare(
          `INSERT INTO notification_settings (user_id, category, enabled) VALUES (?, ?, ?)
           ON CONFLICT(user_id, category) DO UPDATE SET enabled = excluded.enabled`
        ).run(req.userId, category, body[category] ? 1 : 0);
      }
    }
    return { ok: true };
  });

  // FR-NOTIF-001: Web-Push-Subscription registrieren
  app.get('/api/push/key', { preHandler: authenticate }, () => ({ publicKey: vapidPublicKey }));

  app.post('/api/push/subscribe', { preHandler: authenticate }, (req, reply) => {
    const sub = req.body?.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://')) {
      return httpError(reply, 400, MSG.badInput);
    }
    db.prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, subscription_json) VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, subscription_json = excluded.subscription_json`
    ).run(req.userId, sub.endpoint, JSON.stringify(sub));
    return { ok: true };
  });

  app.post('/api/push/unsubscribe', { preHandler: authenticate }, (req) => {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint === 'string') {
      db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(req.userId, endpoint);
    }
    return { ok: true };
  });
}
