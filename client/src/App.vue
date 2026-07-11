<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import { useTasksStore, useShoppingStore, useCostsStore, useBucketStore, useNotifStore } from './stores/data.js';
import { connectEvents, disconnectEvents, flushQueue, queueLength } from './api.js';
import { timeAgo } from './format.js';
import Sheet from './components/Sheet.vue';
import EmptyState from './components/EmptyState.vue';

const auth = useAuthStore();
const tasks = useTasksStore();
const shopping = useShoppingStore();
const costs = useCostsStore();
const bucket = useBucketStore();
const notifs = useNotifStore();
const route = useRoute();
const router = useRouter();

const online = ref(navigator.onLine);
const queued = ref(queueLength());
const showNotifs = ref(false);

// raumfarbe pro modul: attribut auf <html>, damit auch teleportierte sheets sie erben
const ACCENTS = { '/einkauf': 'shopping', '/kosten': 'costs', '/bucketlist': 'bucket', '/mehr': 'more' };
watch(
  () => route.path,
  (path) => {
    const accent = ACCENTS[path];
    if (accent) document.documentElement.dataset.accent = accent;
    else delete document.documentElement.dataset.accent;
  },
  { immediate: true }
);

const tabs = [
  { path: '/aufgaben', label: 'Aufgaben', icon: 'M9 11.5l2 2 4-4.5M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z' },
  { path: '/einkauf', label: 'Einkauf', icon: 'M3 4h2l2.4 12.2a2 2 0 0 0 2 1.8h7.5a2 2 0 0 0 2-1.6L21 8H6M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z' },
  { path: '/kosten', label: 'Kosten', icon: 'M15 9a3.5 3.5 0 0 0-3-1.5C9.5 7.5 8 9.5 8 12s1.5 4.5 4 4.5a3.5 3.5 0 0 0 3-1.5M6.5 10.5h5m-5 3h5M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z' },
  { path: '/bucketlist', label: 'Bucket', icon: 'M12 3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.4l6-.9L12 3z' },
  { path: '/mehr', label: 'Mehr', icon: 'M5 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm7 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm7 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z' }
];

const ready = computed(() => auth.status === 'ready');

function startRealtime() {
  connectEvents({
    shopping: () => shopping.fetch().catch(() => {}),
    tasks: () => tasks.fetch().catch(() => {}),
    costs: () => costs.fetch().catch(() => {}),
    bucket: () => bucket.fetch().catch(() => {}),
    wg: () => Promise.all([auth.loadWg(), tasks.fetch()]).catch(() => {}),
    notification: () => notifs.fetch().catch(() => {})
  });
  notifs.fetch().catch(() => {});
}

watch(ready, (isReady) => {
  if (isReady) startRealtime();
  else disconnectEvents();
});

watch(() => auth.status, (status) => {
  // Nach init()/Login/Beitritt zur passenden Ansicht
  if (status === 'anon' && !route.meta.public) router.replace('/login');
  else if (status === 'noWg' && !route.meta.noWg) router.replace('/onboarding');
  else if (status === 'ready' && (route.meta.public || route.meta.noWg)) router.replace('/aufgaben');
});

async function syncNow() {
  online.value = navigator.onLine;
  if (online.value && queueLength()) {
    await flushQueue();
    await Promise.all([shopping.fetch(), tasks.fetch(), costs.fetch()]).catch(() => {});
  }
  queued.value = queueLength();
}

function onQueueChanged() {
  queued.value = queueLength();
}

function onOffline() {
  online.value = false;
}

async function openNotifs() {
  showNotifs.value = true;
  await notifs.fetch().catch(() => {});
  notifs.markAllRead().catch(() => {});
}

onMounted(async () => {
  window.addEventListener('online', syncNow);
  window.addEventListener('offline', onOffline);
  window.addEventListener('wg-queue-changed', onQueueChanged);
  await auth.init();
  if (ready.value) startRealtime();
  syncNow();
});

onUnmounted(() => {
  window.removeEventListener('online', syncNow);
  window.removeEventListener('offline', onOffline);
  window.removeEventListener('wg-queue-changed', onQueueChanged);
  disconnectEvents();
});
</script>

<template>
  <div v-if="auth.status === 'loading'" class="boot" aria-label="Lädt">
    <div class="boot-logo">WG</div>
  </div>

  <template v-else>
    <div v-if="!online || queued" class="offline-banner" role="status">
      <template v-if="!online">Du bist offline — Änderungen werden synchronisiert, sobald du wieder online bist.</template>
      <template v-else>{{ queued }} Änderung(en) werden synchronisiert …</template>
    </div>

    <header v-if="ready" class="topbar">
      <h1 class="topbar-title">{{ auth.wg?.name }}</h1>
      <button class="bell" aria-label="Benachrichtigungen" @click="openNotifs">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        <span v-if="notifs.unread" class="badge">{{ notifs.unread > 9 ? '9+' : notifs.unread }}</span>
      </button>
    </header>

    <router-view v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </router-view>

    <nav v-if="ready" class="tabbar" aria-label="Hauptnavigation">
      <router-link v-for="tab in tabs" :key="tab.path" :to="tab.path" class="tab" :class="{ active: route.path === tab.path }">
        <span class="tab-ico">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path :d="tab.icon" />
          </svg>
        </span>
        <span>{{ tab.label }}</span>
      </router-link>
    </nav>

    <Sheet :open="showNotifs" title="Benachrichtigungen" @close="showNotifs = false">
      <EmptyState v-if="!notifs.list.length" emoji="🔕" title="Noch nichts passiert" text="Hier siehst du, was in deiner WG los ist." />
      <div v-for="n in notifs.list" :key="n.id" class="notif" :class="{ unread: !n.read }">
        <p>{{ n.text }}</p>
        <span class="muted small">{{ timeAgo(n.created_at) }}</span>
      </div>
    </Sheet>
  </template>
</template>

<style scoped>
.boot {
  min-height: 100dvh;
  display: grid;
  place-items: center;
}

.boot-logo {
  width: 76px;
  height: 76px;
  border-radius: 22px;
  background: var(--brand-ink);
  color: #fff;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.6rem;
  display: grid;
  place-items: center;
}

.offline-banner {
  background: #1a1c22;
  color: #fff;
  font-size: 0.85rem;
  text-align: center;
  padding: calc(6px + var(--safe-top)) 16px 6px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(12px + var(--safe-top)) 16px 4px;
}

.topbar-title {
  font-size: 1.05rem;
  font-weight: 700;
}

.bell {
  position: relative;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: var(--ink);
}

.badge {
  position: absolute;
  top: 4px;
  right: 2px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--danger);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
  display: grid;
  place-items: center;
}

/* dunkles ink-glas: auf der chrome-leiste leuchten die raumfarben */
.tabbar {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 560px;
  display: flex;
  background: rgba(23, 25, 31, 0.88);
  backdrop-filter: blur(18px) saturate(1.4);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  padding-bottom: var(--safe-bottom);
  z-index: 30;
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 7px 0 6px;
  font-size: 0.68rem;
  font-weight: 600;
  color: #a6acb8;
  text-decoration: none;
  min-height: 54px;
  transition: transform 0.12s var(--ease-out-quint);
}

.tab:active { transform: scale(0.94); }

.tab-ico {
  display: grid;
  place-items: center;
  padding: 3px 14px;
  border-radius: 999px;
  transition: background-color 0.2s ease;
}

/* der aktive tab leuchtet in der hellen raumfarbe */
.tab.active { color: var(--brand-bright); }
.tab.active .tab-ico { background: rgba(255, 255, 255, 0.12); }

.notif {
  padding: 12px 2px;
  border-bottom: 1px solid var(--line);
}

.notif.unread p { font-weight: 600; }
</style>
