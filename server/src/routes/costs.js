import { db } from '../db.js';
import { authenticate, requireWg, scopedGet } from '../hooks.js';
import { cleanString, optionalString, isIsoDate, todayLocal, httpError, MSG } from '../util.js';
import { broadcast } from '../events.js';
import { notify } from '../notify.js';

function euro(cents) {
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

/**
 * FR-COST-002: Betrag gleichmäßig aufteilen, Rundungsdifferenz zugunsten des Zahlers.
 * AC-005: 10,00 € / 3 → Zahler-Anteil 3,34, andere je 3,33 → Zahler-Saldo +6,66.
 */
export function computeShares(amountCents, payerId, participantIds) {
  const n = participantIds.length;
  const base = Math.floor(amountCents / n);
  const remainder = amountCents - base * n;
  const shares = new Map(participantIds.map((id) => [id, base]));
  if (shares.has(payerId)) {
    shares.set(payerId, base + remainder);
  } else {
    // Zahler ist nicht beteiligt: Restcents deterministisch auf die ersten Beteiligten
    for (let i = 0; i < remainder; i++) shares.set(participantIds[i], base + 1);
  }
  return shares;
}

/** Wird auch vom Einkaufslisten-Abhaken genutzt (FR-COST-001) */
export function createExpense(wgId, actorId, { title, amountCents, payerId, participantIds, date }) {
  const { lastInsertRowid: expenseId } = db
    .prepare(`INSERT INTO expenses (wg_id, title, amount_cents, payer_id, expense_date, created_by) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(wgId, title, amountCents, payerId, date, actorId);
  for (const [userId, cents] of computeShares(amountCents, payerId, participantIds)) {
    db.prepare('INSERT INTO expense_shares (expense_id, user_id, share_cents) VALUES (?, ?, ?)').run(Number(expenseId), userId, cents);
  }
  db.prepare(`INSERT INTO expense_log (expense_id, action, detail, actor_id) VALUES (?, 'erstellt', ?, ?)`)
    .run(Number(expenseId), `${title}: ${euro(amountCents)}`, actorId);
  const payer = db.prepare('SELECT name FROM users WHERE id = ?').get(payerId);
  notify(wgId, 'costs', `${payer.name} hat ${euro(amountCents)} für „${title}" ausgelegt.`, {
    actorId,
    onlyUserIds: participantIds.filter((id) => id !== actorId)
  });
  broadcast(wgId, 'costs', {}, { excludeUserId: actorId });
  return Number(expenseId);
}

/** Saldo pro Mitglied: gezahlt − Anteile + bestätigte Ausgleichszahlungen */
export function computeBalances(wgId) {
  const balances = new Map();
  const add = (uid, cents) => balances.set(uid, (balances.get(uid) || 0) + cents);
  for (const m of db.prepare('SELECT user_id FROM memberships WHERE wg_id = ?').all(wgId)) add(m.user_id, 0);
  for (const e of db.prepare('SELECT id, payer_id, amount_cents FROM expenses WHERE wg_id = ? AND deleted = 0').all(wgId)) {
    add(e.payer_id, e.amount_cents);
    for (const s of db.prepare('SELECT user_id, share_cents FROM expense_shares WHERE expense_id = ?').all(e.id)) {
      add(s.user_id, -s.share_cents);
    }
  }
  for (const s of db.prepare(`SELECT * FROM settlements WHERE wg_id = ? AND status = 'confirmed'`).all(wgId)) {
    add(s.from_user, s.amount_cents);
    add(s.to_user, -s.amount_cents);
  }
  return balances;
}

/** FR-COST-003: minimale Anzahl Ausgleichszahlungen (Greedy: größter Schuldner → größter Gläubiger) */
export function simplifySettlements(balances) {
  const debtors = [];
  const creditors = [];
  for (const [uid, cents] of balances) {
    if (cents < 0) debtors.push({ uid, cents: -cents });
    else if (cents > 0) creditors.push({ uid, cents });
  }
  debtors.sort((a, b) => b.cents - a.cents);
  creditors.sort((a, b) => b.cents - a.cents);
  const result = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].cents, creditors[j].cents);
    if (amount > 0) result.push({ from: debtors[i].uid, to: creditors[j].uid, amountCents: amount });
    debtors[i].cents -= amount;
    creditors[j].cents -= amount;
    if (debtors[i].cents === 0) i++;
    if (creditors[j].cents === 0) j++;
  }
  return result;
}

function parseExpenseBody(req, reply) {
  const title = cleanString(req.body?.title, 100) || 'Einkauf';
  const amountCents = Number(req.body?.amountCents);
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 100000000) {
    httpError(reply, 400, MSG.badInput);
    return null;
  }
  const date = req.body?.date;
  if (date && !isIsoDate(date)) {
    httpError(reply, 400, MSG.badInput);
    return null;
  }
  const activeIds = db
    .prepare('SELECT user_id FROM memberships WHERE wg_id = ? AND active = 1')
    .all(req.wgId)
    .map((r) => r.user_id);
  let participantIds = Array.isArray(req.body?.participantIds) ? [...new Set(req.body.participantIds.map(Number))] : activeIds;
  if (participantIds.length === 0 || !participantIds.every((id) => activeIds.includes(id))) {
    httpError(reply, 400, MSG.badInput);
    return null;
  }
  let payerId = req.body?.payerId ? Number(req.body.payerId) : req.userId;
  if (!activeIds.includes(payerId)) {
    httpError(reply, 400, MSG.badInput);
    return null;
  }
  return { title, amountCents, payerId, participantIds, date: date || todayLocal() };
}

export default async function costRoutes(app) {
  const guard = { preHandler: [authenticate, requireWg] };

  app.get('/api/costs', guard, (req) => {
    const balances = computeBalances(req.wgId);
    const balanceList = [...balances.entries()].map(([userId, cents]) => ({ userId, cents }));
    const expenses = db
      .prepare(`SELECT * FROM expenses WHERE wg_id = ? AND deleted = 0 ORDER BY expense_date DESC, id DESC LIMIT 50`)
      .all(req.wgId)
      .map((e) => ({
        ...e,
        shares: db.prepare('SELECT user_id, share_cents FROM expense_shares WHERE expense_id = ?').all(e.id)
      }));
    const settlements = db
      .prepare(`SELECT * FROM settlements WHERE wg_id = ? AND (status = 'pending' OR confirmed_at > datetime('now', '-30 days')) ORDER BY id DESC LIMIT 30`)
      .all(req.wgId);
    const log = db
      .prepare(
        `SELECT l.*, e.title AS expense_title FROM expense_log l JOIN expenses e ON e.id = l.expense_id
         WHERE e.wg_id = ? ORDER BY l.id DESC LIMIT 30`
      )
      .all(req.wgId);
    return { balances: balanceList, suggestions: simplifySettlements(balances), expenses, settlements, log };
  });

  // FR-COST-001/002
  app.post('/api/expenses', guard, (req, reply) => {
    const parsed = parseExpenseBody(req, reply);
    if (!parsed) return;
    createExpense(req.wgId, req.userId, parsed);
    return { ok: true };
  });

  // FR-COST-005
  app.patch('/api/expenses/:id', guard, (req, reply) => {
    const expense = scopedGet(reply, 'expenses', req.params.id, req.wgId);
    if (!expense) return;
    if (expense.created_by !== req.userId && expense.payer_id !== req.userId) {
      return httpError(reply, 403, 'Nur Ersteller oder Zahler können Ausgaben bearbeiten.');
    }
    const parsed = parseExpenseBody(req, reply);
    if (!parsed) return;
    db.prepare('UPDATE expenses SET title = ?, amount_cents = ?, payer_id = ?, expense_date = ? WHERE id = ?')
      .run(parsed.title, parsed.amountCents, parsed.payerId, parsed.date, expense.id);
    db.prepare('DELETE FROM expense_shares WHERE expense_id = ?').run(expense.id);
    for (const [userId, cents] of computeShares(parsed.amountCents, parsed.payerId, parsed.participantIds)) {
      db.prepare('INSERT INTO expense_shares (expense_id, user_id, share_cents) VALUES (?, ?, ?)').run(expense.id, userId, cents);
    }
    db.prepare(`INSERT INTO expense_log (expense_id, action, detail, actor_id) VALUES (?, 'bearbeitet', ?, ?)`)
      .run(expense.id, `${euro(expense.amount_cents)} → ${euro(parsed.amountCents)}`, req.userId);
    broadcast(req.wgId, 'costs', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  app.delete('/api/expenses/:id', guard, (req, reply) => {
    const expense = scopedGet(reply, 'expenses', req.params.id, req.wgId);
    if (!expense) return;
    if (expense.created_by !== req.userId && expense.payer_id !== req.userId) {
      return httpError(reply, 403, 'Nur Ersteller oder Zahler können Ausgaben löschen.');
    }
    db.prepare('UPDATE expenses SET deleted = 1 WHERE id = ?').run(expense.id);
    db.prepare(`INSERT INTO expense_log (expense_id, action, detail, actor_id) VALUES (?, 'gelöscht', ?, ?)`)
      .run(expense.id, euro(expense.amount_cents), req.userId);
    broadcast(req.wgId, 'costs', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  // FR-COST-004: Ausgleich erfassen — Empfänger muss bestätigen
  app.post('/api/settlements', guard, (req, reply) => {
    const toUser = Number(req.body?.toUser);
    const amountCents = Number(req.body?.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 100000000 || toUser === req.userId) {
      return httpError(reply, 400, MSG.badInput);
    }
    const member = db.prepare('SELECT 1 FROM memberships WHERE wg_id = ? AND user_id = ?').get(req.wgId, toUser);
    if (!member) return httpError(reply, 400, MSG.badInput);
    db.prepare(`INSERT INTO settlements (wg_id, from_user, to_user, amount_cents) VALUES (?, ?, ?, ?)`)
      .run(req.wgId, req.userId, toUser, amountCents);
    const me = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId);
    notify(req.wgId, 'costs', `${me.name} hat dir ${euro(amountCents)} gezahlt — bitte bestätigen.`, { onlyUserIds: [toUser] });
    broadcast(req.wgId, 'costs', {}, { excludeUserId: req.userId });
    return { ok: true };
  });

  app.post('/api/settlements/:id/:action', guard, (req, reply) => {
    const settlement = scopedGet(reply, 'settlements', req.params.id, req.wgId);
    if (!settlement) return;
    if (settlement.status !== 'pending') return httpError(reply, 409, MSG.conflict);
    if (settlement.to_user !== req.userId) return httpError(reply, 403, 'Nur der Empfänger kann bestätigen.');
    if (req.params.action === 'confirm') {
      db.prepare(`UPDATE settlements SET status = 'confirmed', confirmed_at = datetime('now') WHERE id = ?`).run(settlement.id);
      notify(req.wgId, 'costs', `Deine Zahlung über ${euro(settlement.amount_cents)} wurde bestätigt. ✅`, {
        onlyUserIds: [settlement.from_user]
      });
    } else if (req.params.action === 'decline') {
      db.prepare(`UPDATE settlements SET status = 'declined' WHERE id = ?`).run(settlement.id);
      notify(req.wgId, 'costs', `Deine Zahlung über ${euro(settlement.amount_cents)} wurde abgelehnt.`, {
        onlyUserIds: [settlement.from_user]
      });
    } else {
      return httpError(reply, 400, MSG.badInput);
    }
    broadcast(req.wgId, 'costs', {}, { excludeUserId: req.userId });
    return { ok: true };
  });
}
