<script setup>
// Mehrfachauswahl von Mitgliedern (Rotation, Kosten-Beteiligte)
import Avatar from './Avatar.vue';

const props = defineProps({
  members: { type: Array, required: true },
  modelValue: { type: Array, required: true }
});
const emit = defineEmits(['update:modelValue']);

function toggle(id) {
  const set = new Set(props.modelValue);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  emit('update:modelValue', [...set]);
}
</script>

<template>
  <div class="picker" role="group">
    <button
      v-for="m in members"
      :key="m.id"
      type="button"
      class="picker-item"
      :class="{ selected: modelValue.includes(m.id) }"
      :aria-pressed="modelValue.includes(m.id)"
      @click="toggle(m.id)"
    >
      <Avatar :member="m" :size="28" />
      <span>{{ m.name }}</span>
      <span v-if="modelValue.includes(m.id)" class="tick" aria-hidden="true">✓</span>
    </button>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.picker-item {
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

.picker-item.selected {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand-ink);
}

.tick { font-weight: 700; }
</style>
