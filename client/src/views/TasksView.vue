<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useTasksStore } from '../stores/data.js';
import { api } from '../api.js';
import { dueLabel, formatDate, INTERVAL_LABELS, weekStart, weekDays, todayIso, timeAgo } from '../format.js';
import Avatar from '../components/Avatar.vue';
import Sheet from '../components/Sheet.vue';
import EmptyState from '../components/EmptyState.vue';
import MemberPicker from '../components/MemberPicker.vue';

const auth = useAuthStore();
const store = useTasksStore();

const tab = ref('week'); // week | list | done
const weekOffset = ref(0);
const showCreate = ref(false);
const createMode = ref('task'); // task | rotation
const detailTask = ref(null);
const swapMode = ref(false);
const error = ref('');

// Formular „Neue Aufgabe / Rotation"
const form = ref({ title: '', description: '', dueDate: '', assignedTo: '', interval: 'weekly', memberIds: [] });

const today = computed(() => store.today || todayIso());
const days = computed(() => weekDays(weekStart(todayIso(), weekOffset.value)));
const weekLabel = computed(() => {
  if (weekOffset.value === 0) return 'Diese Woche';
  if (weekOffset.value === 1) return 'Nächste Woche';
  if (weekOffset.value === -1) return 'Letzte Woche';
  return `${formatDate(days.value[0])} – ${formatDate(days.value[6])}`;
});

const allTasks = computed(() => [...store.open, ...store.done]);

function tasksOn(day) {
  return allTasks.value.filter((t) => t.due_date === day);
}

const undatedOpen = computed(() => store.open.filter((t) => !t.due_date));
const mySwapRequests = computed(() => store.swaps.filter((s) => s.to_user === auth.user?.id));
const isOverdue = (t) => t.status === 'open' && t.due_date && t.due_date < today.value;

function member(id) {
  return auth.membersById[id] || null;
}

async function refresh() {
  await store.fetch().catch(() => {});
}

async function toggleDone(task) {
  error.value = '';
  try {
    if (task.status === 'open') {
      task.status = 'done'; // optimistisch
      await api('POST', `/api/tasks/${task.id}/done`, {}, { queueable: true });
    } else {
      await api('POST', `/api/tasks/${task.id}/undone`, {});
    }
    await refresh();
  } catch (err) {
    error.value = err.message;
    await refresh();
  }
}

function canUndo(task) {
  return task.status === 'done' && task.done_at && Date.now() - new Date(task.done_at + 'Z').getTime() < 24 * 3600 * 1000;
}

function openCreate() {
  form.value = {
    title: '', description: '', dueDate: '', assignedTo: '',
    interval: 'weekly', memberIds: auth.activeMembers.map((m) => m.id)
  };
  createMode.value = 'task';
  error.value = '';
  showCreate.value = true;
}

async function submitCreate() {
  error.value = '';
  try {
    if (createMode.value === 'task') {
      await api('POST', '/api/tasks', {
        title: form.value.title,
        description: form.value.description || undefined,
        dueDate: form.value.dueDate || undefined,
        assignedTo: form.value.assignedTo || undefined
      });
    } else {
      await api('POST', '/api/rotations', {
        title: form.value.title,
        description: form.value.description || undefined,
        interval: form.value.interval,
        memberIds: form.value.memberIds,
        firstDue: form.value.dueDate || undefined
      });
    }
    showCreate.value = false;
    await refresh();
  } catch (err) {
    error.value = err.message;
  }
}

function openDetail(task) {
  detailTask.value = task;
  swapMode.value = false;
  error.value = '';
}

const swapCandidates = computed(() => {
  if (!detailTask.value) return [];
  return store.open.filter((t) => t.id !== detailTask.value.id && t.assigned_to && t.assigned_to !== auth.user?.id);
});

async function requestSwap(other) {
  error.value = '';
  try {
    await api('POST', `/api/tasks/${detailTask.value.id}/swap`, { withTaskId: other.id });
    detailTask.value = null;
    await refresh();
  } catch (err) {
    error.value = err.message;
  }
}

async function answerSwap(swap, action) {
  await api('POST', `/api/swaps/${swap.id}/${action}`, {}).catch((err) => (error.value = err.message));
  await refresh();
}

async function removeTask(task) {
  if (!confirm(`„${task.title}" wirklich löschen?`)) return;
  await api('DELETE', `/api/tasks/${task.id}`).catch((err) => (error.value = err.message));
  detailTask.value = null;
  await refresh();
}

async function removeRotation(rotation) {
  if (!confirm(`Putzplan „${rotation.title}" beenden? Offene Instanzen werden entfernt.`)) return;
  await api('DELETE', `/api/rotations/${rotation.id}`).catch((err) => (error.value = err.message));
  await refresh();
}

const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

onMounted(refresh);
</script>

<template>
  <main class="page">
    <h1 class="page-title">Aufgaben</h1>

    <!-- Tauschanfragen an mich -->
    <div v-for="swap in mySwapRequests" :key="swap.id" class="card swap-card">
      <p>
        <strong>{{ member(swap.requested_by)?.name }}</strong> möchte tauschen:
        „{{ swap.from_title }}" ({{ formatDate(swap.from_due) || 'ohne Datum' }}) ↔ deine „{{ swap.to_title }}"
      </p>
      <div class="swap-actions">
        <button class="btn btn-small" @click="answerSwap(swap, 'confirm')">Tauschen</button>
        <button class="btn btn-ghost btn-small" @click="answerSwap(swap, 'decline')">Ablehnen</button>
      </div>
    </div>

    <div class="segmented" role="tablist">
      <button :class="{ active: tab === 'week' }" @click="tab = 'week'">Woche</button>
      <button :class="{ active: tab === 'list' }" @click="tab = 'list'">Pläne</button>
      <button :class="{ active: tab === 'done' }" @click="tab = 'done'">Erledigt</button>
    </div>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <!-- FR-TASK-004: Wochenübersicht -->
    <template v-if="tab === 'week'">
      <div class="week-nav">
        <button class="week-arrow" aria-label="Vorherige Woche" @click="weekOffset--">‹</button>
        <span class="week-label">{{ weekLabel }}</span>
        <button class="week-arrow" aria-label="Nächste Woche" @click="weekOffset++">›</button>
      </div>

      <div v-for="(day, i) in days" :key="day">
        <template v-if="tasksOn(day).length || day === today">
          <p class="day-head" :class="{ today: day === today }">
            {{ dayNames[i] }}, {{ formatDate(day) }}
            <span v-if="day === today" class="chip today-chip">Heute</span>
          </p>
          <p v-if="!tasksOn(day).length" class="muted small day-empty">Nichts geplant.</p>
          <button
            v-for="task in tasksOn(day)"
            :key="task.id"
            class="row task-row"
            :class="{ overdue: isOverdue(task), done: task.status === 'done' }"
            @click="openDetail(task)"
          >
            <span class="check" :class="{ done: task.status === 'done' }" @click.stop="toggleDone(task)" role="checkbox" :aria-checked="task.status === 'done'" :aria-label="`${task.title} erledigt`">
              <span class="ring">{{ task.status === 'done' ? '✓' : '' }}</span>
            </span>
            <span class="row-main">
              <span class="row-title" :class="{ struck: task.status === 'done' }">{{ task.title }}</span>
              <span v-if="task.rotation_id" class="muted small"> · Putzplan</span>
              <span v-if="isOverdue(task)" class="overdue-label"><br />{{ dueLabel(task.due_date, today) }}</span>
            </span>
            <Avatar :member="member(task.assigned_to)" :size="32" />
          </button>
        </template>
      </div>

      <template v-if="undatedOpen.length">
        <p class="day-head">Ohne Datum</p>
        <button v-for="task in undatedOpen" :key="task.id" class="row task-row" @click="openDetail(task)">
          <span class="check" @click.stop="toggleDone(task)" role="checkbox" aria-checked="false" :aria-label="`${task.title} erledigt`">
            <span class="ring"></span>
          </span>
          <span class="row-main"><span class="row-title">{{ task.title }}</span></span>
          <Avatar :member="member(task.assigned_to)" :size="32" />
        </button>
      </template>

      <EmptyState
        v-if="store.loaded && !store.open.length && !store.done.length"
        emoji="🧹"
        title="Noch keine Aufgaben"
        text="Lege eine Aufgabe oder einen rotierenden Putzplan an — mit dem + unten rechts."
      />
    </template>

    <!-- Rotationen + alle offenen -->
    <template v-else-if="tab === 'list'">
      <p class="section-title">Rotierende Putzpläne</p>
      <EmptyState v-if="store.loaded && !store.rotations.length" emoji="🔁" title="Kein Putzplan" text="Erstelle eine wiederkehrende Aufgabe mit fairer Rotation." />
      <div v-for="rotation in store.rotations" :key="rotation.id" class="card rotation-card">
        <div class="rotation-head">
          <div>
            <p class="row-title">{{ rotation.title }}</p>
            <p class="muted small">{{ INTERVAL_LABELS[rotation.interval] }}</p>
          </div>
          <button class="btn btn-danger btn-small" @click="removeRotation(rotation)">Beenden</button>
        </div>
        <div class="rotation-order" aria-label="Rotationsreihenfolge">
          <template v-for="(uid, idx) in rotation.memberIds" :key="uid">
            <Avatar :member="member(uid)" :size="30" />
            <span v-if="idx < rotation.memberIds.length - 1" class="muted" aria-hidden="true">→</span>
          </template>
        </div>
      </div>

      <p class="section-title">Alle offenen Aufgaben</p>
      <button v-for="task in store.open" :key="task.id" class="row task-row" :class="{ overdue: isOverdue(task) }" @click="openDetail(task)">
        <span class="check" @click.stop="toggleDone(task)" role="checkbox" aria-checked="false" :aria-label="`${task.title} erledigt`">
          <span class="ring"></span>
        </span>
        <span class="row-main">
          <span class="row-title">{{ task.title }}</span>
          <span class="muted small"><br />{{ dueLabel(task.due_date, today) }}</span>
        </span>
        <Avatar :member="member(task.assigned_to)" :size="32" />
      </button>
      <EmptyState v-if="store.loaded && !store.open.length" emoji="🎉" title="Alles erledigt" text="Gerade ist nichts offen." />
    </template>

    <!-- Historie -->
    <template v-else>
      <EmptyState v-if="store.loaded && !store.done.length" emoji="🗂️" title="Noch nichts erledigt" text="Erledigte Aufgaben landen hier." />
      <div v-for="task in store.done" :key="task.id" class="row">
        <span class="check done"><span class="ring">✓</span></span>
        <span class="row-main">
          <span class="row-title struck">{{ task.title }}</span>
          <span class="muted small"><br />von {{ member(task.done_by)?.name || '—' }} · {{ timeAgo(task.done_at) }}</span>
        </span>
        <button v-if="canUndo(task)" class="btn btn-ghost btn-small" @click="toggleDone(task)">Zurück</button>
      </div>
    </template>

    <button class="fab" aria-label="Neue Aufgabe" @click="openCreate">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>

    <!-- Sheet: Neu -->
    <Sheet :open="showCreate" title="Neu anlegen" @close="showCreate = false">
      <div class="segmented" role="tablist">
        <button :class="{ active: createMode === 'task' }" @click="createMode = 'task'">Einmalig</button>
        <button :class="{ active: createMode === 'rotation' }" @click="createMode = 'rotation'">Putzplan</button>
      </div>
      <form class="sheet-form" @submit.prevent="submitCreate">
        <div class="field">
          <label for="t-title">Titel</label>
          <input id="t-title" v-model="form.title" maxlength="100" :placeholder="createMode === 'task' ? 'z. B. Pfand wegbringen' : 'z. B. Bad putzen'" required />
        </div>
        <div class="field">
          <label for="t-desc">Beschreibung (optional)</label>
          <input id="t-desc" v-model="form.description" maxlength="500" />
        </div>
        <template v-if="createMode === 'task'">
          <div class="field">
            <label for="t-due">Fällig am (optional)</label>
            <input id="t-due" v-model="form.dueDate" type="date" />
          </div>
          <div class="field">
            <label for="t-assignee">Zugewiesen an (optional)</label>
            <select id="t-assignee" v-model="form.assignedTo">
              <option value="">Niemand</option>
              <option v-for="m in auth.activeMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </div>
        </template>
        <template v-else>
          <div class="field">
            <label for="t-interval">Intervall</label>
            <select id="t-interval" v-model="form.interval">
              <option v-for="(label, value) in INTERVAL_LABELS" :key="value" :value="value">{{ label }}</option>
            </select>
          </div>
          <div class="field">
            <label>Wer macht mit?</label>
            <MemberPicker v-model="form.memberIds" :members="auth.activeMembers" />
          </div>
          <div class="field">
            <label for="t-first">Erste Fälligkeit (optional)</label>
            <input id="t-first" v-model="form.dueDate" type="date" />
          </div>
          <p class="muted small">Die Reihenfolge rotiert automatisch und fair — alle sind gleich oft dran.</p>
        </template>
        <p v-if="error" class="error-text">{{ error }}</p>
        <button class="btn" type="submit">Anlegen</button>
      </form>
    </Sheet>

    <!-- Sheet: Aufgaben-Detail -->
    <Sheet :open="!!detailTask" :title="detailTask?.title || ''" @close="detailTask = null">
      <template v-if="detailTask">
        <p v-if="detailTask.description" class="detail-desc">{{ detailTask.description }}</p>
        <div class="detail-meta">
          <span class="chip">{{ dueLabel(detailTask.due_date, today) }}</span>
          <span v-if="detailTask.rotation_id" class="chip">🔁 Putzplan</span>
          <span class="chip">
            <Avatar :member="member(detailTask.assigned_to)" :size="18" />
            {{ member(detailTask.assigned_to)?.name || 'Niemand' }}
          </span>
        </div>

        <template v-if="!swapMode">
          <button v-if="detailTask.status === 'open'" class="btn" @click="toggleDone(detailTask); detailTask = null">✓ Erledigt</button>
          <button
            v-if="detailTask.status === 'open' && detailTask.assigned_to === auth.user?.id"
            class="btn btn-soft btn-gap"
            @click="swapMode = true"
          >
            ⇄ Mit jemandem tauschen
          </button>
          <button class="btn btn-danger btn-gap" @click="removeTask(detailTask)">Löschen</button>
        </template>

        <template v-else>
          <p class="section-title">Tauschen gegen …</p>
          <EmptyState v-if="!swapCandidates.length" emoji="🤷" title="Nichts zum Tauschen" text="Es gibt keine offene Aufgabe, die jemand anderem zugewiesen ist." />
          <button v-for="cand in swapCandidates" :key="cand.id" class="row task-row" @click="requestSwap(cand)">
            <Avatar :member="member(cand.assigned_to)" :size="32" />
            <span class="row-main">
              <span class="row-title">{{ cand.title }}</span>
              <span class="muted small"><br />{{ dueLabel(cand.due_date, today) }} · {{ member(cand.assigned_to)?.name }}</span>
            </span>
          </button>
          <p class="muted small swap-hint">Die andere Person muss dem Tausch zustimmen.</p>
        </template>
        <p v-if="error" class="error-text">{{ error }}</p>
      </template>
    </Sheet>
  </main>
</template>

<style scoped>
.swap-card { margin-bottom: 12px; border: 1.5px solid var(--brand); }
.swap-actions { display: flex; gap: 8px; margin-top: 10px; }

.segmented { margin-bottom: 6px; }

.week-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0 4px;
}

.week-arrow {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--card);
  box-shadow: var(--shadow);
  font-size: 1.3rem;
  color: var(--ink);
}

.week-label { font-weight: 700; }

.day-head {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--muted);
  margin: 16px 4px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.day-head.today { color: var(--brand-ink); }
.today-chip { background: var(--brand-soft); color: var(--brand-ink); }
.day-empty { margin: 0 4px; }

.task-row {
  width: 100%;
  text-align: left;
  font: inherit;
}

.task-row.done { opacity: 0.65; }
.struck { text-decoration: line-through; color: var(--muted); }

.rotation-card { margin-bottom: 10px; }
.rotation-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.rotation-order { display: flex; align-items: center; gap: 6px; margin-top: 12px; flex-wrap: wrap; }

.sheet-form { margin-top: 14px; }
.detail-desc { margin-bottom: 12px; }
.detail-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
.detail-meta .chip { min-height: 30px; }
.btn-gap { margin-top: 10px; }
.swap-hint { margin-top: 10px; }
</style>
