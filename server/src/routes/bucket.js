import { db, UPLOAD_DIR } from '../db.js';
import { authenticate, requireWg, scopedGet } from '../hooks.js';
import { cleanString, optionalString, isIsoDate, todayLocal, httpError, MSG } from '../util.js';
import { broadcast } from '../events.js';
import { notify } from '../notify.js';
import { randomBytes } from 'node:crypto';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const ALLOWED_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_PHOTO = 10 * 1024 * 1024;

export default async function bucketRoutes(app) {
  const guard = { preHandler: [authenticate, requireWg] };

  app.get('/api/bucket', guard, (req) => {
    const items = db
      .prepare('SELECT * FROM bucket_items WHERE wg_id = ? ORDER BY id DESC')
      .all(req.wgId)
      .map((item) => ({
        ...item,
        votes: db.prepare('SELECT user_id FROM bucket_votes WHERE bucket_item_id = ?').all(item.id).map((v) => v.user_id),
        commentCount: db.prepare('SELECT COUNT(*) AS c FROM bucket_comments WHERE bucket_item_id = ?').get(item.id).c,
        photos: db.prepare('SELECT id FROM attachments WHERE bucket_item_id = ?').all(item.id).map((a) => a.id)
      }));
    return { items };
  });

  app.get('/api/bucket/:id', guard, (req, reply) => {
    const item = scopedGet(reply, 'bucket_items', req.params.id, req.wgId);
    if (!item) return;
    return {
      ...item,
      votes: db.prepare('SELECT user_id FROM bucket_votes WHERE bucket_item_id = ?').all(item.id).map((v) => v.user_id),
      comments: db.prepare('SELECT * FROM bucket_comments WHERE bucket_item_id = ? ORDER BY id').all(item.id),
      photos: db.prepare('SELECT id, mime FROM attachments WHERE bucket_item_id = ?').all(item.id)
    };
  });

  // FR-BUCKET-001
  app.post('/api/bucket', guard, (req, reply) => {
    const title = cleanString(req.body?.title, 100);
    if (!title) return httpError(reply, 400, MSG.badInput);
    const description = optionalString(req.body?.description, 1000);
    const category = optionalString(req.body?.category, 30);
    const targetDate = req.body?.targetDate;
    if (targetDate && !isIsoDate(targetDate)) return httpError(reply, 400, MSG.badInput);
    db.prepare(
      `INSERT INTO bucket_items (wg_id, title, description, category, target_date, created_by) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(req.wgId, title, description, category, targetDate || null, req.userId);
    const me = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId);
    notify(req.wgId, 'bucket', `${me.name} hat eine neue Idee: „${title}"`, { actorId: req.userId });
    broadcast(req.wgId, 'bucket', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  app.delete('/api/bucket/:id', guard, (req, reply) => {
    const item = scopedGet(reply, 'bucket_items', req.params.id, req.wgId);
    if (!item) return;
    if (item.created_by !== req.userId && !req.isAdmin) {
      return httpError(reply, 403, 'Nur Ersteller oder Admin können Einträge löschen.');
    }
    for (const a of db.prepare('SELECT filename FROM attachments WHERE bucket_item_id = ?').all(item.id)) {
      unlink(path.join(UPLOAD_DIR, a.filename)).catch(() => {});
    }
    db.prepare('DELETE FROM bucket_items WHERE id = ?').run(item.id);
    broadcast(req.wgId, 'bucket', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // FR-BUCKET-002: eine Stimme pro Mitglied, zurücknehmbar (Toggle)
  app.post('/api/bucket/:id/vote', guard, (req, reply) => {
    const item = scopedGet(reply, 'bucket_items', req.params.id, req.wgId);
    if (!item) return;
    const existing = db
      .prepare('SELECT 1 FROM bucket_votes WHERE bucket_item_id = ? AND user_id = ?')
      .get(item.id, req.userId);
    if (existing) {
      db.prepare('DELETE FROM bucket_votes WHERE bucket_item_id = ? AND user_id = ?').run(item.id, req.userId);
    } else {
      db.prepare('INSERT INTO bucket_votes (bucket_item_id, user_id) VALUES (?, ?)').run(item.id, req.userId);
    }
    broadcast(req.wgId, 'bucket', {}, { excludeUserId: req.userId });
    return { voted: !existing };
  });

  // FR-BUCKET-003
  app.post('/api/bucket/:id/done', guard, (req, reply) => {
    const item = scopedGet(reply, 'bucket_items', req.params.id, req.wgId);
    if (!item) return;
    const date = req.body?.date && isIsoDate(req.body.date) ? req.body.date : todayLocal();
    db.prepare(`UPDATE bucket_items SET status = 'done', done_at = ? WHERE id = ?`).run(date, item.id);
    notify(req.wgId, 'bucket', `„${item.title}" — erlebt! 🎉`, { actorId: req.userId });
    broadcast(req.wgId, 'bucket', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // FR-BUCKET-005
  app.post('/api/bucket/:id/comments', guard, (req, reply) => {
    const item = scopedGet(reply, 'bucket_items', req.params.id, req.wgId);
    if (!item) return;
    const text = cleanString(req.body?.text, 500);
    if (!text) return httpError(reply, 400, MSG.badInput);
    db.prepare('INSERT INTO bucket_comments (bucket_item_id, user_id, text) VALUES (?, ?, ?)').run(item.id, req.userId, text);
    broadcast(req.wgId, 'bucket', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // FR-BUCKET-004: Foto (JPEG/PNG/WebP, max. 10 MB)
  app.post('/api/bucket/:id/photo', guard, async (req, reply) => {
    const item = scopedGet(reply, 'bucket_items', req.params.id, req.wgId);
    if (!item) return;
    const file = await req.file({ limits: { fileSize: MAX_PHOTO, files: 1 } });
    if (!file) return httpError(reply, 400, MSG.badInput);
    const ext = ALLOWED_MIME[file.mimetype];
    if (!ext) return httpError(reply, 415, 'Bild max. 10 MB (JPEG, PNG oder WebP).');
    const filename = `${req.wgId}-${item.id}-${randomBytes(8).toString('hex')}.${ext}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    const target = path.join(UPLOAD_DIR, filename);
    try {
      await pipeline(file.file, createWriteStream(target));
      if (file.file.truncated) {
        await unlink(target).catch(() => {});
        return httpError(reply, 413, 'Bild max. 10 MB (JPEG, PNG oder WebP).');
      }
    } catch {
      await unlink(target).catch(() => {});
      return httpError(reply, 500, MSG.server);
    }
    db.prepare('INSERT INTO attachments (bucket_item_id, wg_id, filename, mime, size) VALUES (?, ?, ?, ?, ?)')
      .run(item.id, req.wgId, filename, file.mimetype, file.file.bytesRead);
    broadcast(req.wgId, 'bucket', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // Fotos nur für WG-Mitglieder abrufbar (FR-WG-007)
  app.get('/api/photos/:id', guard, (req, reply) => {
    const photo = scopedGet(reply, 'attachments', req.params.id, req.wgId);
    if (!photo) return;
    reply.header('Cache-Control', 'private, max-age=86400');
    return reply.type(photo.mime).send(createReadStream(path.join(UPLOAD_DIR, photo.filename)));
  });
}
