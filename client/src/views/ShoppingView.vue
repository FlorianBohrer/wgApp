<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useShoppingStore, useCostsStore } from '../stores/data.js';
import { api } from '../api.js';
import { parseEuro, timeAgo } from '../format.js';
import Avatar from '../components/Avatar.vue';
import Sheet from '../components/Sheet.vue';
import EmptyState from '../components/EmptyState.vue';
import MemberPicker from '../components/MemberPicker.vue';

const auth = useAuthStore();
const store = useShoppingStore();
const costs = useCostsStore();

const activeListId = ref(null);
const newItem = ref('');
const error = ref('');
const duplicate = ref(null); // { name, listId }
const checkItem = ref(null); // Item im „Abhaken"-Sheet
const amountText = ref('');
const participants = ref([]);
const showNewList = ref(false);
const newListName = ref('');
const addInput = ref(null);

const activeList = computed(() => store.lists.find((l) => l.id === activeListId.value) || store.lists[0]);

async function refresh() {
  await store.fetch().catch(() => {});
  if (!activeListId.value && store.lists.length) activeListId.value = store.lists[0].id;
}

// FR-SHOP-001: Artikel hinzufügen — max. 2 Taps (Feld + Enter)
async function addItem(force = false) {
  const name = (force ? duplicate.value?.name : newItem.value).trim();
  if (!name || !activeList.value) return;
  error.value = '';
  duplicate.value = null;
  try {
    const res = await api('POST', '/api/shopping/items', { listId: activeList.value.id, name, force }, { queueable: true });
    if (res?.queued) {
      // Offline: optimistisch anzeigen
      activeList.value.open.unshift({ id: `tmp-${Date.now()}`, name, status: 'open', added_by: auth.user.id });
    }
    newItem.value = '';
    await refresh();
    addInput.value?.focus();
  } catch (err) {
    if (err.status === 409 && err.data?.duplicateId) {
      duplicate.value = { name, listId: activeList.value.id };
    } else {
      error.value = err.message;
    }
  }
}

function openCheck(item) {
  checkItem.value = item;
  amountText.value = '';
  participants.value = auth.activeMembers.map((m) => m.id);
  error.value = '';
}

// FR-SHOP-002 + optional FR-COST-001
async function confirmCheck(withAmount) {
  const item = checkItem.value;
  let body = {};
  if (withAmount) {
    const cents = parseEuro(amountText.value);
    if (!cents) {
      error.value = 'Betrag bitte als Zahl, z. B. 12,50';
      return;
    }
    if (!participants.value.length) {
      error.value = 'Wähle mindestens eine Person.';
      return;
    }
    body = { amountCents: cents, participantIds: participants.value };
  }
  checkItem.value = null;
  item.status = 'bought'; // optimistisch
  try {
    await api('POST', `/api/shopping/items/${item.id}/check`, body, { queueable: !withAmount });
    await Promise.all([refresh(), withAmount ? costs.fetch() : null]);
  } catch (err) {
    error.value = err.message;
    await refresh();
  }
}

async function readd(item) {
  await api('POST', `/api/shopping/items/${item.id}/readd`, {}, { queueable: true }).catch((err) => (error.value = err.message));
  await refresh();
}

async function removeItem(item) {
  await api('DELETE', `/api/shopping/items/${item.id}`).catch((err) => (error.value = err.message));
  await refresh();
}

async function createList() {
  error.value = '';
  try {
    await api('POST', '/api/shopping/lists', { name: newListName.value });
    newListName.value = '';
    showNewList.value = false;
    await refresh();
    activeListId.value = store.lists[store.lists.length - 1]?.id;
  } catch (err) {
    error.value = err.message;
  }
}

async function removeList(list) {
  if (!confirm(`Liste „${list.name}" mit allen Artikeln löschen?`)) return;
  await api('DELETE', `/api/shopping/lists/${list.id}`).catch((err) => (error.value = err.message));
  activeListId.value = null;
  await refresh();
}

function member(id) {
  return auth.membersById[id] || null;
}

onMounted(refresh);
</script>

<template>
  <main class="page">
    <h1 class="page-title">Einkauf</h1>

    <!-- FR-SHOP-005: mehrere Listen -->
    <div class="list-tabs" role="tablist">
      <button
        v-for="list in store.lists"
        :key="list.id"
        class="list-tab"
        :class="{ active: activeList?.id === list.id }"
        role="tab"
        :aria-selected="activeList?.id === list.id"
        @click="activeListId = list.id"
      >
        {{ list.name }}
        <span v-if="list.open.length" class="count">{{ list.open.length }}</span>
      </button>
      <button v-if="store.lists.length < 10" class="list-tab add" aria-label="Neue Liste" @click="showNewList = true">+</button>
    </div>

    <form class="add-bar" @submit.prevent="addItem(false)">
      <input ref="addInput" v-model="newItem" placeholder="Was fehlt? z. B. Hafermilch" maxlength="80" enterkeyhint="done" aria-label="Artikel hinzufügen" />
      <button class="add-btn" type="submit" :disabled="!newItem.trim()" aria-label="Hinzufügen">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </form>

    <!-- FR-SHOP-003: Duplikat-Hinweis -->
    <div v-if="duplicate" class="card dup-card" role="alertdialog" aria-label="Doppelter Artikel">
      <p>„{{ duplicate.name }}" steht schon auf der Liste.</p>
      <div class="dup-actions">
        <button class="btn btn-soft btn-small" @click="duplicate = null">Zusammenführen</button>
        <button class="btn btn-ghost btn-small" @click="addItem(true)">Trotzdem hinzufügen</button>
      </div>
    </div>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <template v-if="activeList">
      <EmptyState
        v-if="store.loaded && !activeList.open.length"
        emoji="🛒"
        title="Liste ist leer"
        text="Tippe oben ein, was fehlt — alle sehen es sofort."
      />
      <div v-for="item in activeList.open" :key="item.id" class="row">
        <button class="check" role="checkbox" aria-checked="false" :aria-label="`${item.name} abhaken`" @click="openCheck(item)">
          <span class="ring"></span>
        </button>
        <span class="row-main">
          <span class="row-title">{{ item.name }}</span>
          <span v-if="item.qty" class="muted small"> · {{ item.qty }}</span>
        </span>
        <Avatar :member="member(item.added_by)" :size="26" />
        <button class="remove" :aria-label="`${item.name} entfernen`" @click="removeItem(item)">✕</button>
      </div>

      <!-- FR-SHOP-004: Zuletzt gekauft -->
      <template v-if="activeList.bought.length">
        <p class="section-title">Zuletzt gekauft — tippen zum Wiederhinzufügen</p>
        <div class="bought-wrap">
          <button v-for="item in activeList.bought" :key="item.id" class="bought-chip" @click="readd(item)">
            <span aria-hidden="true">↻</span> {{ item.name }}
          </button>
        </div>
        <p class="muted small bought-meta" v-if="activeList.bought[0]?.bought_at">
          Zuletzt: {{ activeList.bought[0].name }} · {{ member(activeList.bought[0].bought_by)?.name }} · {{ timeAgo(activeList.bought[0].bought_at) }}
        </p>
      </template>

      <button v-if="store.lists.length > 1" class="btn-link-danger" @click="removeList(activeList)">Liste „{{ activeList.name }}" löschen</button>
    </template>

    <!-- Sheet: Abhaken (+ optional Betrag → Kosten-Split) -->
    <Sheet :open="!!checkItem" :title="checkItem ? `${checkItem.name} gekauft` : ''" @close="checkItem = null">
      <template v-if="checkItem">
        <div class="field">
          <label for="amount">Betrag (optional)</label>
          <input id="amount" v-model="amountText" inputmode="decimal" placeholder="z. B. 12,50" autocomplete="off" />
        </div>
        <div class="field" v-if="amountText">
          <label>Wer isst/nutzt mit?</label>
          <MemberPicker v-model="participants" :members="auth.activeMembers" />
          <p class="muted small split-hint">Der Betrag wird fair geteilt — Rundungscents gehen an dich.</p>
        </div>
        <p v-if="error" class="error-text">{{ error }}</p>
        <button v-if="amountText" class="btn" @click="confirmCheck(true)">Abhaken & Kosten teilen</button>
        <button class="btn" :class="{ 'btn-ghost': amountText, 'btn-gap': amountText }" @click="confirmCheck(false)">Nur abhaken</button>
      </template>
    </Sheet>

    <!-- Sheet: Neue Liste -->
    <Sheet :open="showNewList" title="Neue Liste" @close="showNewList = false">
      <form @submit.prevent="createList">
        <div class="field">
          <label for="listname">Name</label>
          <input id="listname" v-model="newListName" maxlength="40" placeholder="z. B. Drogerie, Getränke" required />
        </div>
        <p v-if="error" class="error-text">{{ error }}</p>
        <button class="btn" type="submit">Anlegen</button>
      </form>
    </Sheet>
  </main>
</template>

<style scoped>
.list-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 10px;
  -webkit-overflow-scrolling: touch;
}

.list-tab {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--card);
  border: 1.5px solid var(--line);
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--muted);
}

.list-tab.active {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
}

.list-tab .count {
  background: var(--brand-ink);
  color: #fff;
  border-radius: 999px;
  min-width: 20px;
  height: 20px;
  display: inline-grid;
  place-items: center;
  font-size: 0.72rem;
  padding: 0 5px;
}

.list-tab.add { width: 40px; justify-content: center; font-size: 1.1rem; }

.add-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.add-btn {
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  background: var(--brand-ink);
  color: #fff;
  display: grid;
  place-items: center;
}

.add-btn:disabled { opacity: 0.4; }

.dup-card { margin-bottom: 10px; border: 1.5px solid #f08c00; }
.dup-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }

.remove {
  width: 40px;
  height: 40px;
  color: var(--muted);
  display: grid;
  place-items: center;
  border-radius: 50%;
}

.bought-wrap { display: flex; flex-wrap: wrap; gap: 8px; }

.bought-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--card);
  border: 1.5px dashed var(--line);
  color: var(--muted);
  font-weight: 600;
  font-size: 0.9rem;
}

.bought-meta { margin: 10px 4px; }

.btn-link-danger {
  display: block;
  margin: 26px auto 0;
  color: var(--danger-ink);
  font-weight: 600;
  min-height: 44px;
}

.split-hint { margin-top: 8px; }
.btn-gap { margin-top: 10px; }
</style>
