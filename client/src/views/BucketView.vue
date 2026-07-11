<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useBucketStore } from '../stores/data.js';
import { api, getAccessToken, ensureFreshToken } from '../api.js';
import { formatDate, timeAgo } from '../format.js';
import Avatar from '../components/Avatar.vue';
import Sheet from '../components/Sheet.vue';
import EmptyState from '../components/EmptyState.vue';

const auth = useAuthStore();
const store = useBucketStore();

const tab = ref('open'); // open | done
const sort = ref('votes'); // votes | new
const showCreate = ref(false);
const detail = ref(null); // volle Detail-Daten
const commentText = ref('');
const error = ref('');
const uploading = ref(false);
const form = ref({ title: '', description: '', category: '', targetDate: '' });
const photoUrls = ref({}); // attachmentId -> ObjectURL

const myId = computed(() => auth.user?.id);

const openItems = computed(() => {
  const items = store.items.filter((i) => i.status === 'open');
  if (sort.value === 'votes') return [...items].sort((a, b) => b.votes.length - a.votes.length);
  return items;
});

const doneItems = computed(() => store.items.filter((i) => i.status === 'done'));

function member(id) {
  return auth.membersById[id] || null;
}

async function refresh() {
  await store.fetch().catch(() => {});
  if (detail.value) {
    detail.value = await api('GET', `/api/bucket/${detail.value.id}`).catch(() => null) || detail.value;
  }
}

// FR-BUCKET-002: Stimme abgeben/zurücknehmen
async function vote(item) {
  const idx = item.votes.indexOf(myId.value);
  if (idx >= 0) item.votes.splice(idx, 1);
  else item.votes.push(myId.value); // optimistisch
  await api('POST', `/api/bucket/${item.id}/vote`, {}).catch(() => {});
  await refresh();
}

async function openDetail(item) {
  error.value = '';
  commentText.value = '';
  detail.value = await api('GET', `/api/bucket/${item.id}`).catch((err) => {
    error.value = err.message;
    return null;
  });
  if (detail.value) loadPhotos();
}

// Fotos sind auth-geschützt → per fetch laden und als ObjectURL anzeigen
async function loadPhotos() {
  await ensureFreshToken();
  for (const photo of detail.value.photos || []) {
    if (photoUrls.value[photo.id]) continue;
    fetch(`/api/photos/${photo.id}`, { headers: { Authorization: `Bearer ${getAccessToken()}` } })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (blob) photoUrls.value = { ...photoUrls.value, [photo.id]: URL.createObjectURL(blob) };
      })
      .catch(() => {});
  }
}

async function submitCreate() {
  error.value = '';
  try {
    await api('POST', '/api/bucket', {
      title: form.value.title,
      description: form.value.description || undefined,
      category: form.value.category || undefined,
      targetDate: form.value.targetDate || undefined
    });
    showCreate.value = false;
    form.value = { title: '', description: '', category: '', targetDate: '' };
    await refresh();
  } catch (err) {
    error.value = err.message;
  }
}

async function markDone() {
  await api('POST', `/api/bucket/${detail.value.id}/done`, {}).catch((err) => (error.value = err.message));
  await refresh();
}

async function addComment() {
  if (!commentText.value.trim()) return;
  await api('POST', `/api/bucket/${detail.value.id}/comments`, { text: commentText.value }).catch((err) => (error.value = err.message));
  commentText.value = '';
  await refresh();
}

async function removeItem() {
  if (!confirm(`„${detail.value.title}" wirklich löschen?`)) return;
  await api('DELETE', `/api/bucket/${detail.value.id}`).catch((err) => (error.value = err.message));
  detail.value = null;
  await refresh();
}

// FR-BUCKET-004: Foto anhängen
async function uploadPhoto(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    error.value = 'Bild max. 10 MB (JPEG, PNG oder WebP).';
    return;
  }
  uploading.value = true;
  error.value = '';
  try {
    await ensureFreshToken();
    const data = new FormData();
    data.append('photo', file);
    const res = await fetch(`/api/bucket/${detail.value.id}/photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      body: data
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'Upload fehlgeschlagen.');
    }
    await refresh();
    loadPhotos();
  } catch (err) {
    error.value = err.message;
  } finally {
    uploading.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <main class="page">
    <h1 class="page-title">Bucketlist</h1>

    <div class="segmented" role="tablist">
      <button :class="{ active: tab === 'open' }" @click="tab = 'open'">Ideen</button>
      <button :class="{ active: tab === 'done' }" @click="tab = 'done'">Erlebt ✨</button>
    </div>

    <p v-if="error && !detail" class="error-text" role="alert">{{ error }}</p>

    <template v-if="tab === 'open'">
      <div class="sort-row" v-if="openItems.length > 1">
        <button class="chip sort-chip" :class="{ on: sort === 'votes' }" @click="sort = 'votes'">Nach Stimmen</button>
        <button class="chip sort-chip" :class="{ on: sort === 'new' }" @click="sort = 'new'">Neueste</button>
      </div>

      <EmptyState v-if="store.loaded && !openItems.length" emoji="🌟" title="Noch keine Ideen" text="Was wolltet ihr als WG schon immer machen? Sammelt es hier." />

      <div v-for="item in openItems" :key="item.id" class="card bucket-card">
        <button class="bucket-main" @click="openDetail(item)">
          <p class="row-title">{{ item.title }}</p>
          <p class="muted small">
            <span v-if="item.category">{{ item.category }} · </span>
            <span v-if="item.target_date">bis {{ formatDate(item.target_date) }} · </span>
            von {{ member(item.created_by)?.name }}
            <span v-if="item.commentCount"> · 💬 {{ item.commentCount }}</span>
          </p>
        </button>
        <button class="vote" :class="{ voted: item.votes.includes(myId) }" :aria-pressed="item.votes.includes(myId)" :aria-label="`Für ${item.title} stimmen`" @click="vote(item)">
          <span class="heart" aria-hidden="true">{{ item.votes.includes(myId) ? '♥' : '♡' }}</span>
          <span class="vote-count">{{ item.votes.length }}</span>
        </button>
      </div>
    </template>

    <template v-else>
      <EmptyState v-if="store.loaded && !doneItems.length" emoji="📸" title="Noch nichts erlebt" text="Markiert Ideen als erlebt und haltet den Moment mit Fotos fest." />
      <div v-for="item in doneItems" :key="item.id" class="card bucket-card done-card">
        <button class="bucket-main" @click="openDetail(item)">
          <p class="row-title">✔ {{ item.title }}</p>
          <p class="muted small">
            Erlebt am {{ formatDate(item.done_at) }}
            <span v-if="item.photos.length"> · 📷 {{ item.photos.length }}</span>
            <span v-if="item.commentCount"> · 💬 {{ item.commentCount }}</span>
          </p>
        </button>
      </div>
    </template>

    <button class="fab" aria-label="Neue Idee" @click="showCreate = true">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>

    <!-- Sheet: neue Idee -->
    <Sheet :open="showCreate" title="Neue Idee" @close="showCreate = false">
      <form @submit.prevent="submitCreate">
        <div class="field">
          <label for="b-title">Titel</label>
          <input id="b-title" v-model="form.title" maxlength="100" placeholder="z. B. Campingwochenende" required />
        </div>
        <div class="field">
          <label for="b-desc">Beschreibung (optional)</label>
          <textarea id="b-desc" v-model="form.description" maxlength="1000" rows="3"></textarea>
        </div>
        <div class="field">
          <label for="b-cat">Kategorie (optional)</label>
          <input id="b-cat" v-model="form.category" maxlength="30" placeholder="z. B. Ausflug, Essen, Party" />
        </div>
        <div class="field">
          <label for="b-date">Zieldatum (optional)</label>
          <input id="b-date" v-model="form.targetDate" type="date" />
        </div>
        <p v-if="error" class="error-text">{{ error }}</p>
        <button class="btn" type="submit">Auf die Liste!</button>
      </form>
    </Sheet>

    <!-- Sheet: Detail -->
    <Sheet :open="!!detail" :title="detail?.title || ''" @close="detail = null">
      <template v-if="detail">
        <p v-if="detail.description" class="detail-desc">{{ detail.description }}</p>
        <div class="detail-meta">
          <span v-if="detail.category" class="chip">{{ detail.category }}</span>
          <span v-if="detail.status === 'done'" class="chip done-chip">Erlebt am {{ formatDate(detail.done_at) }}</span>
          <span v-else-if="detail.target_date" class="chip">bis {{ formatDate(detail.target_date) }}</span>
          <span class="chip">♥ {{ detail.votes.length }}</span>
        </div>

        <div v-if="detail.photos?.length" class="photo-grid">
          <img v-for="photo in detail.photos" :key="photo.id" :src="photoUrls[photo.id]" alt="Foto zum Erlebnis" loading="lazy" />
        </div>

        <button v-if="detail.status === 'open'" class="btn" @click="markDone">✨ Als erlebt markieren</button>
        <label v-else class="btn btn-soft upload-btn">
          {{ uploading ? 'Lädt hoch …' : '📷 Foto anhängen' }}
          <input type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden" @change="uploadPhoto" :disabled="uploading" />
        </label>

        <p class="section-title">Kommentare</p>
        <p v-if="!detail.comments?.length" class="muted small">Noch keine Kommentare.</p>
        <div v-for="comment in detail.comments" :key="comment.id" class="comment">
          <Avatar :member="member(comment.user_id)" :size="28" />
          <div>
            <p>{{ comment.text }}</p>
            <span class="muted small">{{ member(comment.user_id)?.name }} · {{ timeAgo(comment.created_at) }}</span>
          </div>
        </div>
        <form class="comment-form" @submit.prevent="addComment">
          <input v-model="commentText" maxlength="500" placeholder="Kommentar schreiben …" aria-label="Kommentar" />
          <button class="btn btn-small" type="submit" :disabled="!commentText.trim()">Senden</button>
        </form>

        <p v-if="error" class="error-text">{{ error }}</p>
        <button v-if="detail.created_by === myId || auth.wg?.isAdmin" class="btn-link-danger" @click="removeItem">Eintrag löschen</button>
      </template>
    </Sheet>
  </main>
</template>

<style scoped>
.sort-row { display: flex; gap: 8px; margin: 10px 0; }

.sort-chip { min-height: 36px; border: 1.5px solid var(--line); background: var(--card); }
.sort-chip.on { border-color: var(--brand); color: var(--brand-ink); background: var(--brand-soft); }

.bucket-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding: 14px 16px;
}

.bucket-main {
  flex: 1;
  text-align: left;
  font: inherit;
  min-width: 0;
}

.done-card { background: linear-gradient(135deg, #fff, var(--brand-soft)); }

.vote {
  flex: none;
  min-width: 52px;
  min-height: 52px;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  color: var(--muted);
  background: var(--bg);
}

.vote { transition: transform 0.12s var(--ease-out-quint), background-color 0.15s ease, color 0.15s ease; }
.vote:active { transform: scale(0.88); }
.vote.voted { color: var(--danger); background: var(--danger-soft); }
/* herz-pop beim abstimmen */
.vote.voted .heart { display: inline-block; animation: heart-pop 0.4s var(--spring-pop); }
.vote-count { font-size: 0.78rem; font-weight: 700; }

@keyframes heart-pop {
  from { transform: scale(0.6); }
}

.detail-desc { margin-bottom: 12px; }
.detail-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.done-chip { background: var(--brand-soft); color: var(--brand-ink); }

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.photo-grid img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background: var(--line);
}

.upload-btn { position: relative; }

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.comment {
  display: flex;
  gap: 10px;
  padding: 8px 0;
}

.comment-form {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.comment-form .btn { width: auto; flex: none; }

.btn-link-danger {
  display: block;
  margin: 22px auto 4px;
  color: var(--danger-ink);
  font-weight: 600;
  min-height: 44px;
}
</style>
