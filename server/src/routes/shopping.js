import { db } from '../db.js';
import { authenticate, requireWg, scopedGet } from '../hooks.js';
import { cleanString, optionalString, isIsoDate, todayLocal, httpError, MSG } from '../util.js';
import { broadcast } from '../events.js';
import { createExpense } from './costs.js';

const MAX_LISTS = 10;

export default async function shoppingRoutes(app) {
  const guard = { preHandler: [authenticate, requireWg] };

  app.get('/api/shopping', guard, (req) => {
    const lists = db
      .prepare('SELECT * FROM shopping_lists WHERE wg_id = ? ORDER BY created_at')
      .all(req.wgId)
      .map((list) => ({
        ...list,
        open: db
          .prepare(`SELECT * FROM items WHERE list_id = ? AND status = 'open' ORDER BY id DESC`)
          .all(list.id),
        bought: db
          .prepare(`SELECT * FROM items WHERE list_id = ? AND status = 'bought' ORDER BY bought_at DESC LIMIT 20`)
          .all(list.id)
      }));
    return { lists };
  });

  // FR-SHOP-005
  app.post('/api/shopping/lists', guard, (req, reply) => {
    const name = cleanString(req.body?.name, 40);
    if (!name) return httpError(reply, 400, MSG.badInput);
    const count = db.prepare('SELECT COUNT(*) AS c FROM shopping_lists WHERE wg_id = ?').get(req.wgId).c;
    if (count >= MAX_LISTS) return httpError(reply, 400, `Maximal ${MAX_LISTS} Listen pro WG.`);
    db.prepare('INSERT INTO shopping_lists (wg_id, name) VALUES (?, ?)').run(req.wgId, name);
    broadcast(req.wgId, 'shopping', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  app.delete('/api/shopping/lists/:id', guard, (req, reply) => {
    const list = scopedGet(reply, 'shopping_lists', req.params.id, req.wgId);
    if (!list) return;
    const count = db.prepare('SELECT COUNT(*) AS c FROM shopping_lists WHERE wg_id = ?').get(req.wgId).c;
    if (count <= 1) return httpError(reply, 400, 'Die letzte Liste kann nicht gelöscht werden.');
    db.prepare('DELETE FROM shopping_lists WHERE id = ?').run(list.id);
    broadcast(req.wgId, 'shopping', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // FR-SHOP-001/003
  app.post('/api/shopping/items', guard, (req, reply) => {
    const list = scopedGet(reply, 'shopping_lists', req.body?.listId, req.wgId);
    if (!list) return;
    const name = cleanString(req.body?.name, 80);
    if (!name) return httpError(reply, 400, MSG.badInput);
    const qty = optionalString(req.body?.qty, 30);
    const category = optionalString(req.body?.category, 30);

    // Duplikat-Hinweis: gleicher Name bereits offen auf dieser Liste
    if (!req.body?.force) {
      const dup = db
        .prepare(`SELECT id, name FROM items WHERE list_id = ? AND status = 'open' AND lower(name) = lower(?)`)
        .get(list.id, name);
      if (dup) return reply.code(409).send({ error: `„${dup.name}" steht schon auf der Liste.`, duplicateId: dup.id });
    }
    db.prepare(`INSERT INTO items (list_id, wg_id, name, qty, category, added_by) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(list.id, req.wgId, name, qty, category, req.userId);
    broadcast(req.wgId, 'shopping', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // FR-SHOP-002 (+ optional FR-COST-001 in einem Schritt)
  app.post('/api/shopping/items/:id/check', guard, (req, reply) => {
    const item = scopedGet(reply, 'items', req.params.id, req.wgId);
    if (!item) return;
    // FR-PWA-004: einmal gekauft bleibt gekauft — idempotent
    if (item.status !== 'bought') {
      db.prepare(`UPDATE items SET status = 'bought', bought_by = ?, bought_at = datetime('now') WHERE id = ?`)
        .run(req.userId, item.id);
    }
    const amountCents = req.body?.amountCents ? Number(req.body.amountCents) : null;
    if (amountCents) {
      if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 100000000) {
        return httpError(reply, 400, MSG.badInput);
      }
      const activeIds = db
        .prepare('SELECT user_id FROM memberships WHERE wg_id = ? AND active = 1')
        .all(req.wgId)
        .map((r) => r.user_id);
      let participantIds = Array.isArray(req.body?.participantIds)
        ? [...new Set(req.body.participantIds.map(Number))]
        : activeIds;
      if (participantIds.length === 0 || !participantIds.every((id) => activeIds.includes(id))) {
        return httpError(reply, 400, MSG.badInput);
      }
      createExpense(req.wgId, req.userId, {
        title: item.name,
        amountCents,
        payerId: req.userId,
        participantIds,
        date: todayLocal()
      });
    }
    broadcast(req.wgId, 'shopping', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // FR-SHOP-004
  app.post('/api/shopping/items/:id/readd', guard, (req, reply) => {
    const item = scopedGet(reply, 'items', req.params.id, req.wgId);
    if (!item) return;
    if (item.status !== 'bought') return httpError(reply, 409, MSG.conflict);
    const dup = db
      .prepare(`SELECT id FROM items WHERE list_id = ? AND status = 'open' AND lower(name) = lower(?)`)
      .get(item.list_id, item.name);
    if (!dup) {
      db.prepare(`INSERT INTO items (list_id, wg_id, name, qty, category, added_by) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(item.list_id, req.wgId, item.name, item.qty, item.category, req.userId);
    }
    broadcast(req.wgId, 'shopping', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  app.delete('/api/shopping/items/:id', guard, (req, reply) => {
    const item = scopedGet(reply, 'items', req.params.id, req.wgId);
    if (!item) return;
    db.prepare('DELETE FROM items WHERE id = ?').run(item.id);
    broadcast(req.wgId, 'shopping', {}, { excludeUserId: req.userId });
    return { ok: true };
  });
}
