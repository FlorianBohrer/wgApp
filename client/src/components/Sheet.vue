<script setup>
// Bottom-Sheet: mobiles Standard-Pattern für Formulare und Details
defineProps({
  open: Boolean,
  title: String
});
const emit = defineEmits(['close']);
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="sheet-backdrop" @click.self="emit('close')">
        <div class="sheet" role="dialog" aria-modal="true" :aria-label="title">
          <div class="sheet-handle" aria-hidden="true"></div>
          <div class="sheet-head">
            <h2>{{ title }}</h2>
            <button class="sheet-close" aria-label="Schließen" @click="emit('close')">✕</button>
          </div>
          <div class="sheet-body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(20, 22, 28, 0.45);
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  background: var(--bg);
  border-radius: 22px 22px 0 0;
  width: 100%;
  max-width: 560px;
  max-height: 88dvh;
  display: flex;
  flex-direction: column;
  padding-bottom: max(16px, var(--safe-bottom));
}

.sheet-handle {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: #c9cdd6;
  margin: 10px auto 2px;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px 6px;
}

.sheet-head h2 {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 700;
}

.sheet-close {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: var(--muted);
  font-size: 1rem;
  display: grid;
  place-items: center;
}

.sheet-body {
  overflow-y: auto;
  padding: 8px 20px 12px;
  -webkit-overflow-scrolling: touch;
}

.sheet-enter-active, .sheet-leave-active { transition: opacity 0.18s ease; }
.sheet-enter-active .sheet, .sheet-leave-active .sheet { transition: transform 0.22s ease; }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
.sheet-enter-from .sheet, .sheet-leave-to .sheet { transform: translateY(60px); }
</style>
