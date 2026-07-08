<script setup>
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { api } from '../api.js';

const auth = useAuthStore();
const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);
const forgotSent = ref(false);

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    await auth.login(email.value, password.value);
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}

async function forgot() {
  if (!email.value) {
    error.value = 'Gib zuerst deine E-Mail-Adresse ein.';
    return;
  }
  await api('POST', '/api/auth/forgot', { email: email.value }, { auth: false }).catch(() => {});
  forgotSent.value = true;
}
</script>

<template>
  <main class="page auth-page">
    <div class="hero">
      <div class="logo" aria-hidden="true">WG</div>
      <h1>Willkommen zurück</h1>
      <p class="muted">Aufgaben, Einkauf & Pläne — für deine ganze WG.</p>
    </div>

    <form class="card" @submit.prevent="submit">
      <div class="field">
        <label for="email">E-Mail</label>
        <input id="email" v-model="email" type="email" autocomplete="email" inputmode="email" required />
      </div>
      <div class="field">
        <label for="password">Passwort</label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" required />
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
      <p v-if="forgotSent" class="muted small">Wenn ein Konto existiert, wurde ein Reset-Link verschickt.</p>
      <button class="btn" type="submit" :disabled="busy">Anmelden</button>
      <button class="btn-link" type="button" @click="forgot">Passwort vergessen?</button>
    </form>

    <p class="switch muted">
      Neu hier?
      <router-link to="/registrieren">Konto erstellen</router-link>
    </p>
  </main>
</template>

<style scoped>
.auth-page {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-bottom: 24px;
}

.hero { text-align: center; margin-bottom: 24px; }

.logo {
  width: 68px;
  height: 68px;
  border-radius: 20px;
  background: var(--brand);
  color: #fff;
  font-weight: 800;
  font-size: 1.5rem;
  display: grid;
  place-items: center;
  margin: 0 auto 16px;
}

.hero h1 { font-size: 1.5rem; margin-bottom: 4px; }

.btn-link {
  display: block;
  margin: 14px auto 0;
  color: var(--brand-ink);
  font-weight: 600;
  min-height: 44px;
}

.switch { text-align: center; margin-top: 18px; }
.switch a { color: var(--brand-ink); font-weight: 700; }
</style>
