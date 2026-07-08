// End-to-End-API-Test für die WG-App (AC-001, AC-002, AC-005, AC-006, AC-007, AC-009)
const BASE = 'http://localhost:3001';
let failures = 0;

async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.log(`  ❌ ${name} ${extra}`); }
}

const suffix = Date.now();
const users = {};
for (const name of ['Anna', 'Ben', 'Carla', 'Dana']) {
  const r = await api('POST', '/api/auth/register', null, {
    email: `${name.toLowerCase()}${suffix}@test.de`, name, password: 'passwort123'
  });
  users[name] = { token: r.data.accessToken, id: r.data.user.id };
}

console.log('AC-001: WG gründen & beitreten');
let r = await api('POST', '/api/wg', users.Anna.token, { name: 'Sonnenallee 12' });
check('WG erstellt', r.status === 200);
r = await api('GET', '/api/wg', users.Anna.token);
const code = r.data.inviteCode;
check('Einladungscode 8 Zeichen', typeof code === 'string' && code.length === 8, code);
for (const name of ['Ben', 'Carla']) {
  r = await api('POST', '/api/wg/join', users[name].token, { code });
  check(`${name} beigetreten`, r.status === 200, JSON.stringify(r.data));
}
r = await api('POST', '/api/wg/join', users.Dana.token, { code: 'FALSCH99' });
check('Ungültiger Code → 404', r.status === 404);
r = await api('GET', '/api/wg', users.Anna.token);
check('3 Mitglieder sichtbar', r.data.members.filter(m => m.active).length === 3);

console.log('AC-009: Datenisolation');
await api('POST', '/api/wg', users.Dana.token, { name: 'Andere WG' });
r = await api('POST', '/api/tasks', users.Anna.token, { title: 'Müll rausbringen' });
r = await api('GET', '/api/tasks', users.Anna.token);
const foreignTaskId = r.data.open[0].id;
r = await api('POST', `/api/tasks/${foreignTaskId}/done`, users.Dana.token);
check('Fremde Aufgabe → 403', r.status === 403, `war ${r.status}`);

console.log('AC-002: Rotierender Putzplan (A→B→C→A)');
r = await api('POST', '/api/rotations', users.Anna.token, {
  title: 'Bad putzen', interval: 'weekly',
  memberIds: [users.Anna.id, users.Ben.id, users.Carla.id]
});
check('Rotation erstellt', r.status === 200, JSON.stringify(r.data));
r = await api('GET', '/api/tasks', users.Anna.token);
let inst = r.data.open.find(t => t.title === 'Bad putzen');
check('Erste Instanz → Anna', inst?.assigned_to === users.Anna.id);
await api('POST', `/api/tasks/${inst.id}/done`, users.Anna.token);
r = await api('GET', '/api/tasks', users.Anna.token);
inst = r.data.open.find(t => t.title === 'Bad putzen');
check('Zweite Instanz → Ben', inst?.assigned_to === users.Ben.id);
const firstDue = r.data.done.find(t => t.title === 'Bad putzen')?.due_date;
check('Fälligkeit +7 Tage', inst?.due_date > firstDue, `${firstDue} → ${inst?.due_date}`);
await api('POST', `/api/tasks/${inst.id}/done`, users.Ben.token);
r = await api('GET', '/api/tasks', users.Anna.token);
inst = r.data.open.find(t => t.title === 'Bad putzen');
check('Dritte Instanz → Carla', inst?.assigned_to === users.Carla.id);
await api('POST', `/api/tasks/${inst.id}/done`, users.Carla.token);
r = await api('GET', '/api/tasks', users.Anna.token);
inst = r.data.open.find(t => t.title === 'Bad putzen');
check('Vierte Instanz → wieder Anna', inst?.assigned_to === users.Anna.id);

console.log('AC-005: Kosten-Splitting mit Rundung (10,00 € / 3)');
r = await api('POST', '/api/expenses', users.Anna.token, { title: 'Einkauf', amountCents: 1000 });
check('Ausgabe erfasst', r.status === 200);
r = await api('GET', '/api/costs', users.Anna.token);
const bal = Object.fromEntries(r.data.balances.map(b => [b.userId, b.cents]));
check('Anna +6,66 €', bal[users.Anna.id] === 666, `war ${bal[users.Anna.id]}`);
check('Ben −3,33 €', bal[users.Ben.id] === -333, `war ${bal[users.Ben.id]}`);
check('Carla −3,33 €', bal[users.Carla.id] === -333, `war ${bal[users.Carla.id]}`);
check('Vorschläge: 2 Transaktionen', r.data.suggestions.length === 2);

console.log('AC-006: Ausgleich');
r = await api('POST', '/api/settlements', users.Ben.token, { toUser: users.Anna.id, amountCents: 333 });
check('Zahlung erfasst', r.status === 200);
r = await api('GET', '/api/costs', users.Ben.token);
const pending = r.data.settlements.find(s => s.status === 'pending');
r = await api('POST', `/api/settlements/${pending.id}/confirm`, users.Ben.token);
check('Fremde Bestätigung → 403', r.status === 403);
r = await api('POST', `/api/settlements/${pending.id}/confirm`, users.Anna.token);
check('Anna bestätigt', r.status === 200);
r = await api('GET', '/api/costs', users.Anna.token);
const bal2 = Object.fromEntries(r.data.balances.map(b => [b.userId, b.cents]));
check('Ben-Saldo 0,00 €', bal2[users.Ben.id] === 0, `war ${bal2[users.Ben.id]}`);

console.log('AC-007: Bucketlist-Abstimmung');
await api('POST', '/api/bucket', users.Anna.token, { title: 'Campingwochenende' });
await api('POST', '/api/bucket', users.Ben.token, { title: 'Kochabend' });
r = await api('GET', '/api/bucket', users.Anna.token);
const camping = r.data.items.find(i => i.title === 'Campingwochenende');
const kochen = r.data.items.find(i => i.title === 'Kochabend');
await api('POST', `/api/bucket/${kochen.id}/vote`, users.Anna.token);
await api('POST', `/api/bucket/${kochen.id}/vote`, users.Ben.token);
r = await api('POST', `/api/bucket/${camping.id}/vote`, users.Carla.token);
check('Stimme abgegeben', r.data?.voted === true);
r = await api('POST', `/api/bucket/${camping.id}/vote`, users.Carla.token);
check('Stimme zurückgenommen', r.data?.voted === false);

console.log('Einkaufsliste: Duplikat-Hinweis & Abhaken');
r = await api('GET', '/api/shopping', users.Anna.token);
const listId = r.data.lists[0].id;
await api('POST', '/api/shopping/items', users.Anna.token, { listId, name: 'Hafermilch' });
r = await api('POST', '/api/shopping/items', users.Ben.token, { listId, name: 'hafermilch' });
check('Duplikat → 409', r.status === 409, JSON.stringify(r.data));
r = await api('GET', '/api/shopping', users.Ben.token);
const item = r.data.lists[0].open.find(i => i.name === 'Hafermilch');
r = await api('POST', `/api/shopping/items/${item.id}/check`, users.Ben.token, { amountCents: 219 });
check('Abgehakt mit Betrag', r.status === 200);
r = await api('GET', '/api/shopping', users.Ben.token);
check('In „Zuletzt gekauft"', r.data.lists[0].bought.some(i => i.name === 'Hafermilch'));
r = await api('GET', '/api/costs', users.Ben.token);
check('Ausgabe „Hafermilch" angelegt', r.data.expenses.some(e => e.title === 'Hafermilch' && e.amount_cents === 219));

console.log('Login-Sperre (FR-AUTH-004)');
const email = `anna${suffix}@test.de`;
for (let i = 0; i < 6; i++) await api('POST', '/api/auth/login', null, { email, password: 'falsch123' });
r = await api('POST', '/api/auth/login', null, { email, password: 'passwort123' });
check('Nach 6 Fehlversuchen gesperrt → 429', r.status === 429, `war ${r.status}`);

console.log(failures === 0 ? '\nALLE TESTS BESTANDEN' : `\n${failures} TEST(S) FEHLGESCHLAGEN`);
process.exit(failures === 0 ? 0 : 1);
