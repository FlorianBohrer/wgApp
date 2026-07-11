<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useFeedbackStore, useTasksStore } from '../stores/data.js';
import { api } from '../api.js';
import { timeAgo, dueLabel, todayIso } from '../format.js';
import Avatar from '../components/Avatar.vue';
import Sheet from '../components/Sheet.vue';
import EmptyState from '../components/EmptyState.vue';

const auth = useAuthStore();
const store = useFeedbackStore();
const tasks = useTasksStore();

const showCompose = ref(false);
const mode = ref('task'); // task | remind | app
const error = ref('');
const info = ref('');
const busy = ref(false);

// formular „lob & kritik"
const toUser = ref(null);
const rating = ref('up');
const taskId = ref('');
const text = ref('');

const myId = computed(() => auth.user?.id);
const others = computed(() => auth.activeMembers.filter((m) => m.id !== myId.value));

// erledigte aufgaben der ausgewählten person (für konkretes lob)
const doneTasksOf = computed(() =>
  toUser.value ? tasks.done.filter((t) => t.done_by === toUser.value).slice(0, 10) : []
);

// offene, anderen zugewiesene aufgaben (zum erinnern)
const remindables = computed(() =>
  tasks.open.filter((t) => t.assigned_to && t.assigned_to !== myId.value)
);

function member(id) {
  return auth.membersById[id] || null;
}

function openCompose(startMode = 'task') {
  mode.value = startMode;
  toUser.value = others.value[0]?.id ?? null;
  rating.value = 'up';
  taskId.value = '';
  text.value = '';
  error.value = '';
  info.value = '';
  showCompose.value = true;
}

async function refresh() {
  await Promise.all([store.fetch(), tasks.fetch()]).catch(() => {});
}

async function submitTaskFeedback() {
  error.value = '';
  busy.value = true;
  try {
    await api('POST', '/api/feedback/task', {
      toUser: toUser.value,
      rating: rating.value,
      taskId: taskId.value || undefined,
      text: text.value || undefined
    });
    showCompose.value = false;
    await refresh();
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}

async function submitAppFeedback() {
  error.value = '';
  busy.value = true;
  try {
    await api('POST', '/api/feedback/app', { text: text.value });
    showCompose.value = false;
    await refresh();
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}

async function remind(task) {
  error.value = '';
  info.value = '';
  try {
    await api('POST', '/api/feedback/remind', { taskId: task.id });
    info.value = `${member(task.assigned_to)?.name} wurde an „${task.title}" erinnert. 🔔`;
    await refresh();
  } catch (err) {
    error.value = err.message;
  }
}

function feedIcon(entry) {
  if (entry.type === 'app') return '💬';
  if (entry.type === 'reminder') return '🔔';
  return entry.rating === 'up' ? '👍' : '🛠️';
}

function feedLabel(entry) {
  if (entry.type === 'app') return 'App-Feedback';
  if (entry.type === 'reminder') return 'Erinnerung';
  return entry.rating === 'up' ? 'Lob' : 'Verbesserungswunsch';
}

onMounted(refresh);
</script>

<template>
  <main class="page">
    <h1 class="page-title">Feedback</h1>

    <p v-if="info" class="info-note" role="status">{{ info }}</p>
    <p v-if="error && !showCompose" class="error-text" role="alert">{{ error }}</p>

    <!-- schnellzugriffe: die drei feedback-arten in je einem tap -->
    <div class="quick-row">
      <button class="quick" @click="openCompose('task')">
        <span aria-hidden="true">👍</span>
        Lob & Kritik
      </button>
      <button class="quick" @click="openCompose('remind')">
        <span aria-hidden="true">🔔</span>
        Erinnern
      </button>
      <button class="quick" @click="openCompose('app')">
        <span aria-hidden="true">💬</span>
        Zur App
      </button>
    </div>

    <p class="section-title">Pinnwand</p>
    <EmptyState
      v-if="store.loaded && !store.feed.length"
      emoji="📌"
      title="Noch nichts an der Pinnwand"
      text="Lob motiviert! Bedank dich fürs Putzen oder erinnere freundlich an offene Aufgaben."
    />

    <div v-for="entry in store.feed" :key="entry.id" class="card feed-card">
      <span class="feed-icon" aria-hidden="true">{{ feedIcon(entry) }}</span>
      <div class="feed-main">
        <p class="feed-head">
          <strong>{{ member(entry.from_user)?.name || 'Ehemaliges Mitglied' }}</strong>
          <template v-if="entry.to_user"> → <strong>{{ member(entry.to_user)?.name || 'Ehemaliges Mitglied' }}</strong></template>
          <span class="chip feed-chip">{{ feedLabel(entry) }}</span>
        </p>
        <p v-if="entry.type === 'reminder'" class="feed-text">Denk an „{{ entry.task_title }}" 🙂</p>
        <template v-else>
          <p v-if="entry.task_title" class="muted small">zu „{{ entry.task_title }}"</p>
          <p v-if="entry.text" class="feed-text">{{ entry.text }}</p>
        </template>
        <span class="muted small">{{ timeAgo(entry.created_at) }}</span>
      </div>
      <Avatar :member="member(entry.from_user)" :size="30" />
    </div>

    <button class="fab" aria-label="Feedback geben" @click="openCompose('task')">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>

    <Sheet :open="showCompose" title="Feedback geben" @close="showCompose = false">
      <div class="segmented" role="tablist">
        <button :class="{ active: mode === 'task' }" @click="mode = 'task'">Lob & Kritik</button>
        <button :class="{ active: mode === 'remind' }" @click="mode = 'remind'">Erinnern</button>
        <button :class="{ active: mode === 'app' }" @click="mode = 'app'">App</button>
      </div>

      <!-- lob oder verbesserungswunsch an eine person -->
      <form v-if="mode === 'task'" class="sheet-form" @submit.prevent="submitTaskFeedback">
        <EmptyState v-if="!others.length" emoji="🧑‍🤝‍🧑" title="Noch allein hier" text="Lade zuerst Mitbewohner:innen ein — dann gibt es jemanden zum Loben." />
        <template v-else>
          <div class="field">
            <label>An wen?</label>
            <div class="person-row" role="radiogroup">
              <button
                v-for="m in others"
                :key="m.id"
                type="button"
                class="person"
                :class="{ selected: toUser === m.id }"
                role="radio"
                :aria-checked="toUser === m.id"
                @click="toUser = m.id; taskId = ''"
              >
                <Avatar :member="m" :size="30" />
                {{ m.name }}
              </button>
            </div>
          </div>
          <div class="field">
            <label>Was möchtest du sagen?</label>
            <div class="segmented" role="radiogroup">
              <button type="button" :class="{ active: rating === 'up' }" role="radio" :aria-checked="rating === 'up'" @click="rating = 'up'">👍 Lob</button>
              <button type="button" :class="{ active: rating === 'down' }" role="radio" :aria-checked="rating === 'down'" @click="rating = 'down'">🛠️ Verbesserung</button>
            </div>
          </div>
          <div v-if="doneTasksOf.length" class="field">
            <label for="fb-task">Zu welcher Aufgabe? (optional)</label>
            <select id="fb-task" v-model="taskId">
              <option value="">Allgemein</option>
              <option v-for="t in doneTasksOf" :key="t.id" :value="t.id">{{ t.title }}</option>
            </select>
          </div>
          <div class="field">
            <label for="fb-text">Nachricht (optional)</label>
            <input id="fb-text" v-model="text" maxlength="500" :placeholder="rating === 'up' ? 'z. B. Bad glänzt — danke!' : 'z. B. Bitte auch hinter dem Herd wischen'" />
          </div>
          <p v-if="error" class="error-text">{{ error }}</p>
          <button class="btn" type="submit" :disabled="busy || !toUser">Senden</button>
        </template>
      </form>

      <!-- freundliches anstupsen bei offenen aufgaben -->
      <div v-else-if="mode === 'remind'" class="sheet-form">
        <EmptyState v-if="!remindables.length" emoji="🌤️" title="Nichts zu erinnern" text="Gerade ist keine offene Aufgabe jemand anderem zugewiesen." />
        <button v-for="task in remindables" :key="task.id" class="row task-row" @click="remind(task)">
          <Avatar :member="member(task.assigned_to)" :size="32" />
          <span class="row-main">
            <span class="row-title">{{ task.title }}</span>
            <span class="muted small"><br />{{ member(task.assigned_to)?.name }} · {{ dueLabel(task.due_date, todayIso()) }}</span>
          </span>
          <span class="chip">🔔 Erinnern</span>
        </button>
        <p v-if="error" class="error-text">{{ error }}</p>
        <p v-if="info" class="info-note" role="status">{{ info }}</p>
        <p class="muted small remind-hint">Pro Aufgabe kannst du alle 12 Stunden einmal erinnern — freundlich bleibt's.</p>
      </div>

      <!-- feedback zur app selbst -->
      <form v-else class="sheet-form" @submit.prevent="submitAppFeedback">
        <div class="field">
          <label for="app-text">Was sollen wir an der App verbessern?</label>
          <textarea id="app-text" v-model="text" maxlength="500" rows="4" placeholder="Idee, Lob oder Bug — alles hilft." required></textarea>
        </div>
        <p v-if="error" class="error-text">{{ error }}</p>
        <button class="btn" type="submit" :disabled="busy || !text.trim()">Senden</button>
      </form>
    </Sheet>
  </main>
</template>

<style scoped>
.quick-row {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}

.quick {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 6px;
  min-height: 68px;
  background: var(--card);
  border: 1px solid rgba(26, 28, 34, 0.05);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  font-weight: 600;
  font-size: 0.85rem;
  transition: transform 0.12s var(--ease-out-quint);
}

.quick:active { transform: scale(0.96); }
.quick span { font-size: 1.3rem; }

.feed-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 10px;
  padding: 14px 16px;
}

.feed-icon { font-size: 1.3rem; }
.feed-main { flex: 1; min-width: 0; }

.feed-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.feed-chip { background: var(--brand-soft); color: var(--brand-ink); }
.feed-text { margin: 2px 0; overflow-wrap: anywhere; }

.info-note {
  background: var(--brand-soft);
  color: var(--brand-ink);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  margin-bottom: 10px;
  font-weight: 600;
  font-size: 0.9rem;
}

.sheet-form { margin-top: 14px; }

.person-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.person {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  min-height: 44px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--card);
  font-weight: 600;
  font-size: 0.92rem;
}

.person.selected {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand-ink);
}

.task-row {
  width: 100%;
  text-align: left;
  font: inherit;
}

.remind-hint { margin-top: 12px; }
</style>
