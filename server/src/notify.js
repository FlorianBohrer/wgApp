import { db, DATA_DIR } from './db.js';
import { broadcast } from './events.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

// VAPID-Keys für Web-Push beim ersten Start generieren
const vapidFile = path.join(DATA_DIR, 'vapid.json');
let vapid;
if (existsSync(vapidFile)) {
  vapid = JSON.parse(readFileSync(vapidFile, 'utf8'));
} else {
  vapid = webpush.generateVAPIDKeys();
  writeFileSync(vapidFile, JSON.stringify(vapid, null, 2), { mode: 0o600 });
}
webpush.setVapidDetails('mailto:admin@wg-app.local', vapid.publicKey, vapid.privateKey);

export const vapidPublicKey = vapid.publicKey;

const settingStmt = db.prepare(
  'SELECT enabled FROM notification_settings WHERE user_id = ? AND category = ?'
);
const insertStmt = db.prepare(
  'INSERT INTO notifications (wg_id, user_id, category, text) VALUES (?, ?, ?, ?)'
);
const subsStmt = db.prepare('SELECT id, subscription_json FROM push_subscriptions WHERE user_id = ?');
const delSubStmt = db.prepare('DELETE FROM push_subscriptions WHERE id = ?');

/**
 * Benachrichtigt Mitglieder einer WG.
 * FR-NOTIF-005: actorId erhält nie eine Benachrichtigung über die eigene Aktion.
 * category: 'tasks' | 'shopping' | 'costs' | 'bucket' | 'wg'
 */
export function notify(wgId, category, text, { actorId = null, onlyUserIds = null } = {}) {
  let userIds;
  if (onlyUserIds) {
    userIds = onlyUserIds;
  } else {
    userIds = db
      .prepare('SELECT user_id FROM memberships WHERE wg_id = ? AND active = 1')
      .all(wgId)
      .map((r) => r.user_id);
  }
  const recipients = [];
  for (const uid of userIds) {
    if (uid === actorId) continue;
    const setting = settingStmt.get(uid, category);
    if (setting && !setting.enabled) continue;
    insertStmt.run(wgId, uid, category, text);
    recipients.push(uid);
    sendPush(uid, text);
  }
  if (recipients.length) {
    broadcast(wgId, 'notification', { category, text }, { onlyUserIds: recipients });
  }
}

function sendPush(userId, text) {
  for (const row of subsStmt.all(userId)) {
    const sub = JSON.parse(row.subscription_json);
    webpush
      .sendNotification(sub, JSON.stringify({ title: 'WG-App', body: text }))
      .catch((err) => {
        // 404/410 = Subscription existiert nicht mehr
        if (err.statusCode === 404 || err.statusCode === 410) delSubStmt.run(row.id);
      });
  }
}
