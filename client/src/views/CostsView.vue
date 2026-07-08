<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useCostsStore } from '../stores/data.js';
import { api } from '../api.js';
import { formatEuro, parseEuro, formatDate, todayIso, timeAgo } from '../format.js';
import Avatar from '../components/Avatar.vue';
import Sheet from '../components/Sheet.vue';
import EmptyState from '../components/EmptyState.vue';
import MemberPicker from '../components/MemberPicker.vue';

const auth = useAuthStore();
const store = useCostsStore();

const showAdd = ref(false);
const editExpense = ref(null);
const showLog = ref(false);
const error = ref('');
const form = ref({ title: '', amount: '', payerId: null, participantIds: [], date: '' });

const myId = computed(() => auth.user?.id);

function member(id) {
  return auth.membersById[id] || null;
}

const sortedBalances = computed(() =>
  [...store.balances]
    .filter((b) => member(b.userId) && (member(b.userId).active || b.cents !== 0))
    .sort((a, b) => b.cents - a.cents)
);

// FR-COST-004: Zahlung an mich, die ich bestätigen muss
const toConfirm = computed(() => store.settlements.filter((s) => s.status === 'pending' && s.to_user === myId.value));
const pendingMine = computed(() => store.settlements.filter((s) => s.status === 'pending' && s.from_user === myId.value));
const mySuggestions = computed(() => store.suggestions.filter((s) => s.from === myId.value));

async function refresh() {
  await store.fetch().catch(() => {});
}

function openAdd(expense = null) {
  editExpense.value = expense;
  form.value = expense
    ? {
        title: expense.title,
        amount: (expense.amount_cents / 100).toFixed(2).replace('.', ','),
        payerId: expense.payer_id,
        participantIds: expense.shares.map((s) => s.user_id),
        date: expense.expense_date
      }
    : { title: '', amount: '', payerId: myId.value, participantIds: auth.activeMembers.map((m) => m.id), date: todayIso() };
  error.value = '';
  showAdd.value = true;
}

async function submitExpense() {
  const cents = parseEuro(form.value.amount);
  if (!cents) {
    error.value = 'Betrag bitte als Zahl, z. B. 24,90';
    return;
  }
  if (!form.value.participantIds.length) {
    error.value = 'Wähle mindestens eine beteiligte Person.';
    return;
  }
  const body = {
    title: form.value.title || 'Einkauf',
    amountCents: cents,
    payerId: form.value.payerId,
    participantIds: form.value.participantIds,
    date: form.value.date
  };
  try {
    if (editExpense.value) await api('PATCH', `/api/expenses/${editExpense.value.id}`, body);
    else await api('POST', '/api/expenses', body);
    showAdd.value = false;
    await refresh();
  } catch (err) {
    error.value = err.message;
  }
}

async function removeExpense() {
  if (!confirm('Ausgabe wirklich löschen? Alle Salden werden neu berechnet.')) return;
  await api('DELETE', `/api/expenses/${editExpense.value.id}`).catch((err) => (error.value = err.message));
  showAdd.value = false;
  await refresh();
}

async function paySuggestion(suggestion) {
  if (!confirm(`${formatEuro(suggestion.amountCents)} an ${member(suggestion.to)?.name} als bezahlt melden?`)) return;
  await api('POST', '/api/settlements', { toUser: suggestion.to, amountCents: suggestion.amountCents }).catch((err) => (error.value = err.message));
  await refresh();
}

async function answerSettlement(settlement, action) {
  await api('POST', `/api/settlements/${settlement.id}/${action}`, {}).catch((err) => (error.value = err.message));
  await refresh();
}

function canEdit(expense) {
  return expense.created_by === myId.value || expense.payer_id === myId.value;
}

function balanceClass(cents) {
  return cents > 0 ? 'amount-pos' : cents < 0 ? 'amount-neg' : 'amount-zero';
}

function balanceLabel(cents) {
  if (cents > 0) return `bekommt ${formatEuro(cents)}`;
  if (cents < 0) return `schuldet ${formatEuro(-cents)}`;
  return 'ausgeglichen';
}

onMounted(refresh);
</script>

<template>
  <main class="page">
    <h1 class="page-title">Kosten</h1>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <!-- Zahlungen, die ich bestätigen muss -->
    <div v-for="s in toConfirm" :key="s.id" class="card confirm-card">
      <p><strong>{{ member(s.from_user)?.name }}</strong> hat dir <strong>{{ formatEuro(s.amount_cents) }}</strong> gezahlt — stimmt das?</p>
      <div class="confirm-actions">
        <button class="btn btn-small" @click="answerSettlement(s, 'confirm')">Bestätigen</button>
        <button class="btn btn-ghost btn-small" @click="answerSettlement(s, 'decline')">Ablehnen</button>
      </div>
    </div>

    <!-- FR-COST-003: Salden -->
    <p class="section-title">Salden</p>
    <div class="card">
      <EmptyState v-if="store.loaded && !sortedBalances.length" emoji="💶" title="Noch keine Ausgaben" text="Erfasse den ersten Einkauf mit dem + unten rechts." />
      <div v-for="b in sortedBalances" :key="b.userId" class="balance-row">
        <Avatar :member="member(b.userId)" :size="36" />
        <span class="row-main">
          <span class="row-title">{{ member(b.userId)?.name }}</span>
          <span v-if="!member(b.userId)?.active" class="muted small"> · ehemaliges Mitglied</span>
        </span>
        <span :class="balanceClass(b.cents)">{{ balanceLabel(b.cents) }}</span>
      </div>
    </div>

    <!-- Vereinfachte Ausgleichszahlungen -->
    <template v-if="store.suggestions.length">
      <p class="section-title">Ausgleich — so seid ihr mit {{ store.suggestions.length }} Zahlung(en) quitt</p>
      <div v-for="(s, i) in store.suggestions" :key="i" class="row">
        <Avatar :member="member(s.from)" :size="30" />
        <span class="row-main small">
          <strong>{{ member(s.from)?.name }}</strong> → <strong>{{ member(s.to)?.name }}</strong>
        </span>
        <span class="amount-zero">{{ formatEuro(s.amountCents) }}</span>
        <button v-if="s.from === myId" class="btn btn-soft btn-small" @click="paySuggestion(s)">Hab ich gezahlt</button>
      </div>
    </template>

    <p v-for="s in pendingMine" :key="s.id" class="muted small pending-note">
      ⏳ {{ formatEuro(s.amount_cents) }} an {{ member(s.to_user)?.name }} — wartet auf Bestätigung
    </p>

    <!-- Historie -->
    <p class="section-title">Ausgaben</p>
    <EmptyState v-if="store.loaded && !store.expenses.length" emoji="🧾" title="Keine Ausgaben" text="Beim Abhaken auf der Einkaufsliste kannst du direkt den Betrag erfassen." />
    <button v-for="e in store.expenses" :key="e.id" class="row expense-row" :disabled="!canEdit(e)" @click="canEdit(e) && openAdd(e)">
      <Avatar :member="member(e.payer_id)" :size="32" />
      <span class="row-main">
        <span class="row-title">{{ e.title }}</span>
        <span class="muted small"><br />{{ member(e.payer_id)?.name }} · {{ formatDate(e.expense_date) }} · {{ e.shares.length }} Personen</span>
      </span>
      <span class="amount-zero">{{ formatEuro(e.amount_cents) }}</span>
    </button>

    <button v-if="store.log.length" class="btn-link" @click="showLog = true">Änderungsprotokoll ansehen</button>

    <button class="fab" aria-label="Ausgabe erfassen" @click="openAdd()">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>

    <!-- Sheet: Ausgabe erfassen/bearbeiten -->
    <Sheet :open="showAdd" :title="editExpense ? 'Ausgabe bearbeiten' : 'Ausgabe erfassen'" @close="showAdd = false">
      <form @submit.prevent="submitExpense">
        <div class="field">
          <label for="e-title">Wofür?</label>
          <input id="e-title" v-model="form.title" maxlength="100" placeholder="z. B. Wocheneinkauf" />
        </div>
        <div class="field">
          <label for="e-amount">Betrag</label>
          <input id="e-amount" v-model="form.amount" inputmode="decimal" placeholder="z. B. 24,90" autocomplete="off" required />
        </div>
        <div class="field">
          <label for="e-payer">Bezahlt von</label>
          <select id="e-payer" v-model="form.payerId">
            <option v-for="m in auth.activeMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>Beteiligt</label>
          <MemberPicker v-model="form.participantIds" :members="auth.activeMembers" />
        </div>
        <div class="field">
          <label for="e-date">Datum</label>
          <input id="e-date" v-model="form.date" type="date" required />
        </div>
        <p v-if="error" class="error-text">{{ error }}</p>
        <button class="btn" type="submit">{{ editExpense ? 'Speichern' : 'Erfassen' }}</button>
        <button v-if="editExpense" class="btn btn-danger btn-gap" type="button" @click="removeExpense">Löschen</button>
      </form>
    </Sheet>

    <!-- Sheet: Änderungsprotokoll (FR-COST-005) -->
    <Sheet :open="showLog" title="Änderungsprotokoll" @close="showLog = false">
      <div v-for="entry in store.log" :key="entry.id" class="log-row">
        <p><strong>{{ entry.expense_title }}</strong> {{ entry.action }} <span class="muted">({{ entry.detail }})</span></p>
        <span class="muted small">{{ member(entry.actor_id)?.name }} · {{ timeAgo(entry.created_at) }}</span>
      </div>
    </Sheet>
  </main>
</template>

<style scoped>
.confirm-card { margin-bottom: 12px; border: 1.5px solid var(--brand); }
.confirm-actions { display: flex; gap: 8px; margin-top: 10px; }

.balance-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  min-height: 52px;
}

.balance-row + .balance-row { border-top: 1px solid var(--line); }

.expense-row {
  width: 100%;
  text-align: left;
  font: inherit;
}

.expense-row:disabled { cursor: default; opacity: 1; }

.pending-note { margin: 10px 4px; }

.btn-link {
  display: block;
  margin: 18px auto 0;
  color: var(--brand-ink);
  font-weight: 600;
  min-height: 44px;
}

.log-row {
  padding: 10px 2px;
  border-bottom: 1px solid var(--line);
}

.btn-gap { margin-top: 10px; }
</style>
