import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

// Secrets (JWT + VAPID) werden beim ersten Start generiert und lokal abgelegt
const secretsFile = path.join(DATA_DIR, 'secrets.json');
export function loadSecrets() {
  if (existsSync(secretsFile)) return JSON.parse(readFileSync(secretsFile, 'utf8'));
  const secrets = { jwt: randomBytes(48).toString('hex') };
  writeFileSync(secretsFile, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  return secrets;
}

export const db = new DatabaseSync(path.join(DATA_DIR, 'wg-app.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  failed_logins INTEGER NOT NULL DEFAULT 0,
  first_fail_at TEXT,
  lock_until TEXT
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  admin_id INTEGER NOT NULL REFERENCES users(id),
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wg_id INTEGER NOT NULL REFERENCES wgs(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  color_index INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  left_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_memberships_wg ON memberships(wg_id, active);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id, active);

CREATE TABLE IF NOT EXISTS rotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wg_id INTEGER NOT NULL REFERENCES wgs(id),
  title TEXT NOT NULL,
  description TEXT,
  interval TEXT NOT NULL CHECK (interval IN ('daily','weekly','biweekly','monthly')),
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rotation_members (
  rotation_id INTEGER NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (rotation_id, user_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wg_id INTEGER NOT NULL REFERENCES wgs(id),
  rotation_id INTEGER REFERENCES rotations(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  assigned_to INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  done_by INTEGER REFERENCES users(id),
  done_at TEXT,
  rotated INTEGER NOT NULL DEFAULT 0,
  reminders_sent INTEGER NOT NULL DEFAULT 0,
  last_reminder_on TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_wg ON tasks(wg_id, status);

CREATE TABLE IF NOT EXISTS swap_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wg_id INTEGER NOT NULL REFERENCES wgs(id),
  task_from INTEGER NOT NULL REFERENCES tasks(id),
  task_to INTEGER NOT NULL REFERENCES tasks(id),
  requested_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shopping_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wg_id INTEGER NOT NULL REFERENCES wgs(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  wg_id INTEGER NOT NULL REFERENCES wgs(id),
  name TEXT NOT NULL,
  qty TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','bought')),
  added_by INTEGER NOT NULL REFERENCES users(id),
  bought_by INTEGER REFERENCES users(id),
  bought_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_list ON items(list_id, status);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wg_id INTEGER NOT NULL REFERENCES wgs(id),
  title TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  payer_id INTEGER NOT NULL REFERENCES users(id),
  expense_date TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_wg ON expenses(wg_id, deleted);

CREATE TABLE IF NOT EXISTS expense_shares (
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  share_cents INTEGER NOT NULL,
  PRIMARY KEY (expense_id, user_id)
);

CREATE TABLE IF NOT EXISTS expense_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail TEXT,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wg_id INTEGER NOT NULL REFERENCES wgs(id),
  from_user INTEGER NOT NULL REFERENCES users(id),
  to_user INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT
);

CREATE TABLE IF NOT EXISTS bucket_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wg_id INTEGER NOT NULL REFERENCES wgs(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  done_at TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bucket_votes (
  bucket_item_id INTEGER NOT NULL REFERENCES bucket_items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (bucket_item_id, user_id)
);

CREATE TABLE IF NOT EXISTS bucket_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_item_id INTEGER NOT NULL REFERENCES bucket_items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_item_id INTEGER NOT NULL REFERENCES bucket_items(id) ON DELETE CASCADE,
  wg_id INTEGER NOT NULL REFERENCES wgs(id),
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wg_id INTEGER NOT NULL REFERENCES wgs(id),
  type TEXT NOT NULL CHECK (type IN ('app','task','reminder')),
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  task_title TEXT,
  to_user INTEGER REFERENCES users(id),
  rating TEXT CHECK (rating IN ('up','down')),
  text TEXT,
  from_user INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_wg ON feedback(wg_id, id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wg_id INTEGER NOT NULL REFERENCES wgs(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, category)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
