import { db } from './db.js';
import { advanceRotation } from './routes/tasks.js';
import { notify } from './notify.js';
import { broadcast } from './events.js';
import { todayLocal } from './util.js';

/**
 * Läuft jede Minute:
 * - FR-ROTA-002: abgelaufene Rotationsinstanzen → nächste Instanz erzeugen
 * - FR-NOTIF-002: Fälligkeits-Erinnerung um 09:00 lokaler Zeit
 * - FR-ROTA-004: überfällige Aufgaben täglich erinnern (max. 3×)
 */
function tick() {
  const today = todayLocal();

  // Intervall abgelaufen → rotieren (Instanz bleibt offen & überfällig sichtbar)
  const expired = db
    .prepare(`SELECT * FROM tasks WHERE status = 'open' AND rotated = 0 AND rotation_id IS NOT NULL AND due_date < ?`)
    .all(today);
  for (const task of expired) advanceRotation(task);

  // Erinnerungen erst ab 09:00
  if (new Date().getHours() < 9) return;

  const dueToday = db
    .prepare(
      `SELECT * FROM tasks WHERE status = 'open' AND assigned_to IS NOT NULL AND due_date = ?
       AND (last_reminder_on IS NULL OR last_reminder_on < ?)`
    )
    .all(today, today);
  for (const task of dueToday) {
    db.prepare('UPDATE tasks SET last_reminder_on = ? WHERE id = ?').run(today, task.id);
    notify(task.wg_id, 'tasks', `Heute fällig: „${task.title}"`, { onlyUserIds: [task.assigned_to] });
  }

  const overdue = db
    .prepare(
      `SELECT * FROM tasks WHERE status = 'open' AND assigned_to IS NOT NULL AND due_date < ?
       AND reminders_sent < 3 AND (last_reminder_on IS NULL OR last_reminder_on < ?)`
    )
    .all(today, today);
  for (const task of overdue) {
    db.prepare('UPDATE tasks SET last_reminder_on = ?, reminders_sent = reminders_sent + 1 WHERE id = ?').run(today, task.id);
    notify(task.wg_id, 'tasks', `Überfällig: „${task.title}" — bitte kümmere dich darum.`, { onlyUserIds: [task.assigned_to] });
  }
  if (expired.length) {
    for (const task of expired) broadcast(task.wg_id, 'tasks', {});
  }
}

export function startScheduler(log) {
  tick();
  setInterval(() => {
    try {
      tick();
    } catch (err) {
      log.error(err, 'Scheduler-Fehler');
    }
  }, 60000);
}
