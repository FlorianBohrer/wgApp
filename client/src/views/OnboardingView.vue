<script setup>
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const mode = ref('join'); // join | create
const wgName = ref('');
const code = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    if (mode.value === 'create') await auth.createWg(wgName.value);
    else await auth.joinWg(code.value.toUpperCase());
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="page auth-page">
    <div class="hero">
      <h1>Hallo {{ auth.user?.name }}! 👋</h1>
      <p class="muted">Tritt deiner WG bei — oder gründe eine neue.</p>
    </div>

    <div class="segmented" role="tablist">
      <button :class="{ active: mode === 'join' }" role="tab" :aria-selected="mode === 'join'" @click="mode = 'join'">Code eingeben</button>
      <button :class="{ active: mode === 'create' }" role="tab" :aria-selected="mode === 'create'" @click="mode = 'create'">WG gründen</button>
    </div>

    <form class="card form-card" @submit.prevent="submit">
      <template v-if="mode === 'join'">
        <div class="field">
          <label for="code">Einladungscode</label>
          <input id="code" v-model="code" class="code-input" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="z. B. K7MPX2WQ" required />
        </div>
        <p class="muted small">Den 8-stelligen Code bekommst du von deinen Mitbewohner:innen.</p>
      </template>
      <template v-else>
        <div class="field">
          <label for="wgname">Name eurer WG</label>
          <input id="wgname" v-model="wgName" maxlength="60" placeholder="z. B. Sonnenallee 12" required />
        </div>
        <p class="muted small">Du wirst WG-Admin und bekommst einen Einladungscode für die anderen.</p>
      </template>
      <p v-if="error" class="error-text">{{ error }}</p>
      <button class="btn" type="submit" :disabled="busy">
        {{ mode === 'join' ? 'Beitreten' : 'WG gründen' }}
      </button>
    </form>

    <button class="btn-link" @click="auth.logout()">Abmelden</button>
  </main>
</template>

<style scoped>
.auth-page {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-bottom: 24px;
}

.hero { text-align: center; margin-bottom: 20px; }
.hero h1 { font-size: 1.5rem; margin-bottom: 4px; }

.form-card { margin-top: 14px; }

.code-input {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-weight: 700;
  font-size: 1.15rem;
  text-align: center;
}

.btn-link {
  display: block;
  margin: 18px auto 0;
  color: var(--muted);
  font-weight: 600;
  min-height: 44px;
}
</style>
