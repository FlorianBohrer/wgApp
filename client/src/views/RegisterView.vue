<script setup>
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const name = ref('');
const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  if (password.value.length < 8) {
    error.value = 'Das Passwort braucht mindestens 8 Zeichen.';
    return;
  }
  busy.value = true;
  try {
    await auth.register(email.value, name.value, password.value);
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
      <div class="logo" aria-hidden="true">WG</div>
      <h1>Konto erstellen</h1>
      <p class="muted">Danach gründest du eine WG oder trittst mit Code bei.</p>
    </div>

    <form class="card" @submit.prevent="submit">
      <div class="field">
        <label for="name">Anzeigename</label>
        <input id="name" v-model="name" autocomplete="nickname" maxlength="40" placeholder="z. B. Flo" required />
      </div>
      <div class="field">
        <label for="email">E-Mail</label>
        <input id="email" v-model="email" type="email" autocomplete="email" inputmode="email" required />
      </div>
      <div class="field">
        <label for="password">Passwort (min. 8 Zeichen)</label>
        <input id="password" v-model="password" type="password" autocomplete="new-password" minlength="8" required />
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
      <button class="btn" type="submit" :disabled="busy">Registrieren</button>
    </form>

    <p class="switch muted">
      Schon ein Konto?
      <router-link to="/login">Anmelden</router-link>
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
  background: var(--brand-ink);
  color: #fff;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.5rem;
  display: grid;
  place-items: center;
  margin: 0 auto 16px;
}

.hero h1 { font-size: 1.5rem; margin-bottom: 4px; }

.switch { text-align: center; margin-top: 18px; }
.switch a { color: var(--brand-ink); font-weight: 700; }
</style>
