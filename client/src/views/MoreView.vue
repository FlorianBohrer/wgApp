<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useNotifStore } from '../stores/data.js';
import { api } from '../api.js';
import Avatar from '../components/Avatar.vue';

const auth = useAuthStore();
const notifs = useNotifStore();

const error = ref('');
const info = ref('');
const pushState = ref('unknown'); // unknown | unsupported | off | on
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

const CATEGORY_LABELS = { tasks: 'Aufgaben & Putzplan', shopping: 'Einkauf', costs: 'Kosten', bucket: 'Bucketlist', wg: 'WG-Ereignisse' };

const formerMembers = computed(() => auth.members.filter((m) => !m.active));

async function copyCode() {
  const code = auth.wg?.inviteCode;
  const text = `Tritt unserer WG „${auth.wg?.name}" bei! Code: ${code} — ${location.origin}`;
  if (navigator.share) {
    await navigator.share({ text }).catch(() => {});
  } else {
    await navigator.clipboard.writeText(text).catch(() => {});
    info.value = 'Einladung kopiert!';
    setTimeout(() => (info.value = ''), 2000);
  }
}

async function renewCode() {
  if (!confirm('Neuen Code erzeugen? Der alte wird sofort ungültig.')) return;
  try {
    const res = await api('POST', '/api/wg/renew-code');
    auth.wg.inviteCode = res.inviteCode;
  } catch (err) {
    error.value = err.message;
  }
}

async function removeMember(m) {
  if (!confirm(`${m.name} wirklich aus der WG entfernen?`)) return;
  try {
    await api('DELETE', `/api/wg/members/${m.id}`);
    await auth.loadWg();
  } catch (err) {
    error.value = err.message;
  }
}

async function leaveWg() {
  if (!confirm('WG wirklich verlassen? Deine offenen Aufgaben werden neu verteilt, dein Saldo bleibt sichtbar.')) return;
  await api('POST', '/api/wg/leave').catch((err) => (error.value = err.message));
  await auth.loadMe();
}

async function toggleSetting(category) {
  notifs.settings[category] = !notifs.settings[category];
  await notifs.saveSettings().catch(() => {});
}

// FR-NOTIF-001: Web-Push (auf iOS nur in der installierten PWA verfügbar)
async function detectPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    pushState.value = 'unsupported';
    return;
  }
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  pushState.value = sub ? 'on' : 'off';
}

async function enablePush() {
  error.value = '';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      error.value = 'Benachrichtigungen wurden nicht erlaubt.';
      return;
    }
    const { publicKey } = await api('GET', '/api/push/key');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    await api('POST', '/api/push/subscribe', { subscription: sub.toJSON() });
    pushState.value = 'on';
  } catch (err) {
    error.value = 'Push konnte nicht aktiviert werden.';
  }
}

async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  pushState.value = 'off';
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function deleteAccount() {
  if (!confirm('Konto endgültig löschen? Deine Beiträge werden anonymisiert („Ehemaliges Mitglied"). Das kann nicht rückgängig gemacht werden.')) return;
  await api('DELETE', '/api/me').catch(() => {});
  auth.reset();
}

onMounted(async () => {
  await notifs.loadSettings().catch(() => {});
  detectPush();
});
</script>

<template>
  <main class="page">
    <h1 class="page-title">Mehr</h1>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <!-- Einladung -->
    <p class="section-title">Mitbewohner:innen einladen</p>
    <div class="card">
      <p class="muted small">Einladungscode für „{{ auth.wg?.name }}"</p>
      <p class="invite-code">{{ auth.wg?.inviteCode }}</p>
      <div class="invite-actions">
        <button class="btn btn-small" @click="copyCode">Teilen</button>
        <button v-if="auth.wg?.isAdmin" class="btn btn-ghost btn-small" @click="renewCode">Code erneuern</button>
      </div>
      <p v-if="info" class="muted small info-note">{{ info }}</p>
    </div>

    <!-- Mitglieder -->
    <p class="section-title">Mitglieder</p>
    <div class="card">
      <div v-for="m in auth.activeMembers" :key="m.id" class="member-row">
        <Avatar :member="m" :size="36" />
        <span class="row-main">
          <span class="row-title">{{ m.name }}<span v-if="m.id === auth.user?.id"> (du)</span></span>
          <span v-if="m.id === auth.wg?.adminId" class="muted small"> · Admin</span>
        </span>
        <button
          v-if="auth.wg?.isAdmin && m.id !== auth.user?.id"
          class="btn btn-danger btn-small"
          @click="removeMember(m)"
        >
          Entfernen
        </button>
      </div>
      <p v-if="formerMembers.length" class="muted small former-note">
        Ehemalig: {{ formerMembers.map((m) => m.name).join(', ') }}
      </p>
    </div>

    <!-- Benachrichtigungen -->
    <p class="section-title">Benachrichtigungen</p>
    <div class="card">
      <template v-if="notifs.settings">
        <div v-for="(label, category) in CATEGORY_LABELS" :key="category" class="setting-row">
          <span>{{ label }}</span>
          <button
            class="toggle"
            :class="{ on: notifs.settings[category] }"
            role="switch"
            :aria-checked="notifs.settings[category]"
            :aria-label="label"
            @click="toggleSetting(category)"
          >
            <span class="knob"></span>
          </button>
        </div>
      </template>
      <div class="push-block">
        <template v-if="pushState === 'unsupported'">
          <p class="muted small" v-if="!isStandalone">
            💡 Für Push auf dem iPhone: App zuerst über <strong>Teilen → „Zum Home-Bildschirm"</strong> installieren, dann hier aktivieren.
          </p>
          <p class="muted small" v-else>Push wird auf diesem Gerät nicht unterstützt.</p>
        </template>
        <button v-else-if="pushState === 'off'" class="btn btn-soft" @click="enablePush">Push-Benachrichtigungen aktivieren</button>
        <button v-else-if="pushState === 'on'" class="btn btn-ghost" @click="disablePush">Push deaktivieren</button>
      </div>
    </div>

    <!-- Konto -->
    <p class="section-title">Konto</p>
    <div class="card">
      <p class="row-title">{{ auth.user?.name }}</p>
      <p class="muted small">{{ auth.user?.email }}</p>
      <button class="btn btn-ghost btn-gap" @click="auth.logout()">Abmelden</button>
      <button class="btn btn-danger btn-gap" @click="leaveWg">WG verlassen</button>
      <button class="btn-link-danger" @click="deleteAccount">Konto löschen (DSGVO)</button>
    </div>

    <p class="muted small install-hint" v-if="!isStandalone">
      📱 Tipp: Öffne diese Seite in Safari und wähle <strong>Teilen → „Zum Home-Bildschirm"</strong> — dann läuft die WG-App wie eine echte App.
    </p>
  </main>
</template>

<style scoped>
.invite-code {
  font-family: var(--font-display);
  font-size: 1.8rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  margin: 6px 0 12px;
  font-variant-numeric: tabular-nums;
}

.invite-actions { display: flex; gap: 8px; }
.info-note { margin-top: 8px; }

.member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  min-height: 52px;
}

.member-row + .member-row { border-top: 1px solid var(--line); }
.former-note { margin-top: 10px; }

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  min-height: 48px;
}

.setting-row + .setting-row { border-top: 1px solid var(--line); }

.toggle {
  width: 52px;
  height: 32px;
  border-radius: 999px;
  background: #cdd2db;
  position: relative;
  transition: background 0.15s ease;
  flex: none;
}

.toggle.on { background: var(--brand); }

.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

.toggle.on .knob { transform: translateX(20px); }

.push-block { margin-top: 12px; }
.btn-gap { margin-top: 10px; }

.btn-link-danger {
  display: block;
  margin: 16px auto 0;
  color: var(--danger-ink);
  font-weight: 600;
  min-height: 44px;
}

.install-hint {
  margin: 22px 8px 0;
  text-align: center;
}
</style>
